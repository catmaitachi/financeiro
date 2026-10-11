import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createApp } from '../src/app.ts'
import { CHECKING, seeded, tx } from './support.ts'

const HOST = { host: 'localhost:8787' }

type Json = Record<string, any>

/** Cliente mínimo do MCP sobre HTTP: uma requisição JSON-RPC por chamada. */
function client(app: ReturnType<typeof createApp>, token: string | null) {
  let id = 0
  const send = (method: string, params: Json = {}) =>
    app.request('/mcp', {
      method: 'POST',
      headers: {
        ...HOST,
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
  const rpc = async (method: string, params: Json = {}): Promise<Json> => (await send(method, params)).json() as Promise<Json>
  const call = async (name: string, args: Json = {}): Promise<Json> => (await rpc('tools/call', { name, arguments: args })).result
  return { send, rpc, call }
}

async function ready() {
  const context = seeded()
  context.provider.transactions = [
    tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 4590, type: 'DEBIT', description: 'RESTAURANTE SABOR', categoryId: '11010000' }),
    tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 500000, type: 'CREDIT', description: 'SALARIO', categoryId: '01000000' }),
  ]
  const { run } = await context.container.sync.run({ trigger: 'manual' })
  assert.equal(run?.status, 'success', JSON.stringify(run?.items))
  const app = createApp(context.container)
  const token = await context.container.mcpToken.current()
  return { ...context, app, token, mcp: client(app, token) }
}

describe('MCP: acesso', () => {
  it('sem token, recusa com 401', async () => {
    const { app } = await ready()
    const response = await client(app, null).send('tools/list')

    assert.equal(response.status, 401)
    assert.equal(response.headers.get('www-authenticate'), 'Bearer')
    assert.equal(((await response.json()) as Json).error.code, 'unauthorized')
  })

  it('token errado também é recusado, inclusive em leitura', async () => {
    const { app, token } = await ready()

    assert.equal((await client(app, `${token}x`).send('tools/list')).status, 401)
    assert.equal((await client(app, 'fin_qualquer-coisa').send('tools/list')).status, 401)
  })

  it('só atende o próprio computador, mesmo com token válido', async () => {
    const { app, token } = await ready()
    const response = await app.request('/mcp', {
      method: 'POST',
      headers: { host: 'financeiro.exemplo.com', authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: '{}',
    })

    assert.equal(response.status, 403)
  })

  it('responde ao initialize com o nome e as instruções do servidor', async () => {
    const { mcp } = await ready()
    const { result } = await mcp.rpc('initialize', {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: { name: 'teste', version: '1.0.0' },
    })

    assert.equal(result.serverInfo.name, 'financeiro')
    assert.match(result.instructions, /centavos/)
  })
})

describe('MCP: ferramentas de leitura', () => {
  it('lista as ferramentas, todas marcadas como somente leitura', async () => {
    const { mcp } = await ready()
    const { result } = await mcp.rpc('tools/list')
    const names = result.tools.map((tool: Json) => tool.name).sort()

    assert.deepEqual(names, [
      'estado_da_sincronizacao',
      'fila_de_conciliacao',
      'listar_categorias',
      'listar_conexoes',
      'listar_contas',
      'listar_previsoes',
      'listar_transacoes',
      'resumo_do_mes',
    ])
    for (const tool of result.tools) assert.equal(tool.annotations.readOnlyHint, true, tool.name)
  })

  it('listar_contas devolve contas e cartão em centavos', async () => {
    const { mcp } = await ready()
    const result = await mcp.call('listar_contas')

    assert.equal(result.isError, undefined)
    assert.equal(result.structuredContent.contas.length, 2)
    assert.deepEqual(JSON.parse(result.content[0].text), result.structuredContent)
    assert.ok(result.structuredContent.contas.some((conta: Json) => conta.id === CHECKING))
  })

  it('listar_transacoes aplica os filtros e traz os totais', async () => {
    const { mcp } = await ready()

    const all = await mcp.call('listar_transacoes', { mes: '2026-10' })
    assert.equal(all.structuredContent.total, 2)
    assert.equal(all.structuredContent.totals.inCents, 500000)

    const filtered = await mcp.call('listar_transacoes', { busca: 'restaurante', direcao: 'out' })
    assert.equal(filtered.structuredContent.total, 1)
    assert.equal(filtered.structuredContent.items[0].description, 'RESTAURANTE SABOR')
  })

  it('resumo_do_mes usa o mês corrente quando nenhum é informado', async () => {
    const { mcp } = await ready()
    const explicit = await mcp.call('resumo_do_mes', { mes: '2026-10' })
    const implicit = await mcp.call('resumo_do_mes')

    assert.deepEqual(implicit.structuredContent, explicit.structuredContent)
  })

  it('entrada inválida volta como erro da ferramenta, sem derrubar o servidor', async () => {
    const { mcp } = await ready()
    const response = await mcp.rpc('tools/call', { name: 'listar_transacoes', arguments: { mes: 'outubro' } })
    const failed = response.error ?? response.result

    assert.ok(failed.isError || failed.code, 'esperava erro')
    assert.match(JSON.stringify(failed), /AAAA-MM/)
    assert.equal((await mcp.call('listar_contas')).isError, undefined)
  })

  it('nenhuma resposta carrega credenciais da Pluggy nem o token', async () => {
    const { mcp, token } = await ready()
    const dump = JSON.stringify([
      await mcp.call('listar_conexoes'),
      await mcp.call('listar_contas'),
      await mcp.call('estado_da_sincronizacao'),
      await mcp.rpc('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 't', version: '1' } }),
    ])

    assert.ok(!dump.includes(token))
    assert.ok(!/clientSecret|client_secret|apiKey/i.test(dump))
  })
})

const WRITE_TOOLS = [
  'confirmar_conciliacao',
  'criar_previsao',
  'definir_status_da_ocorrencia',
  'desfazer_conciliacao',
  'recategorizar_transacao',
  'rejeitar_conciliacao',
  'sincronizar',
]

const names = async (mcp: ReturnType<typeof client>) =>
  ((await mcp.rpc('tools/list')).result.tools as Json[]).map((tool) => tool.name as string)

describe('MCP: escrita', () => {
  it('vem desligada: as ferramentas nem aparecem e chamá-las falha', async () => {
    const { mcp, container } = await ready()

    assert.equal(container.settings.app().mcpWriteEnabled, false)
    const listed = await names(mcp)
    for (const name of WRITE_TOOLS) assert.ok(!listed.includes(name), `${name} não deveria aparecer`)

    const attempt = await mcp.rpc('tools/call', { name: 'sincronizar', arguments: {} })
    assert.ok(attempt.error || attempt.result?.isError, 'esperava recusa')
  })

  it('ligar o interruptor libera as ferramentas na próxima chamada, desligar tira de novo', async () => {
    const { mcp, container } = await ready()

    container.settings.updateApp({ mcpWriteEnabled: true })
    const enabled = await names(mcp)
    for (const name of WRITE_TOOLS) assert.ok(enabled.includes(name), `${name} deveria aparecer`)

    const { result } = await mcp.rpc('tools/list')
    for (const tool of result.tools.filter((t: Json) => WRITE_TOOLS.includes(t.name))) {
      assert.equal(tool.annotations.readOnlyHint, false, tool.name)
    }

    container.settings.updateApp({ mcpWriteEnabled: false })
    assert.ok(!(await names(mcp)).includes('sincronizar'))
  })

  it('recategorizar_transacao muda a categoria e null devolve a original', async () => {
    const { mcp, container } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })
    const find = async () =>
      (await mcp.call('listar_transacoes', { busca: 'restaurante' })).structuredContent.items[0] as Json

    const before = await find()
    assert.equal(before.categoryId, '11010000')

    const changed = await mcp.call('recategorizar_transacao', { transacao: before.id, categoria: '10000000' })
    assert.equal(changed.isError, undefined)
    assert.equal((await find()).categoryId, '10000000')

    await mcp.call('recategorizar_transacao', { transacao: before.id, categoria: null })
    assert.equal((await find()).categoryId, '11010000')
  })

  it('recategorizar_transacao exige ao menos uma alteração e recusa categoria desconhecida', async () => {
    const { mcp, container } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })
    const id = ((await mcp.call('listar_transacoes')).structuredContent.items[0] as Json).id

    const empty = await mcp.rpc('tools/call', { name: 'recategorizar_transacao', arguments: { transacao: id } })
    assert.match(JSON.stringify(empty), /Nada para alterar/)

    const unknown = await mcp.call('recategorizar_transacao', { transacao: id, categoria: '99999999' })
    assert.equal(unknown.isError, true)
    assert.match(unknown.content[0].text, /Categoria desconhecida/)
  })

  it('criar_previsao cria a série, devolve a série criada e reavalia a conciliação', async () => {
    const { mcp, container } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })
    let reconciled = 0
    const original = container.reconciliation.reconcile.bind(container.reconciliation)
    container.reconciliation.reconcile = () => {
      reconciled++
      return original()
    }

    const created = await mcp.call('criar_previsao', { expressao: '-300*3', nome: 'Seguro', mes_inicial: '2026-11' })

    assert.equal(created.isError, undefined)
    assert.equal(created.structuredContent.name, 'Seguro')
    assert.equal(created.structuredContent.occurrences.length, 3)
    assert.equal(reconciled, 1)
    assert.equal((await mcp.call('listar_previsoes')).structuredContent.previsoes.length, 1)
  })

  it('criar_previsao devolve a mensagem do serviço, com exemplos, quando a expressão é inválida', async () => {
    const { mcp, container } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })

    const bad = await mcp.call('criar_previsao', { expressao: 'abc' })
    assert.equal(bad.isError, true)
    assert.match(bad.content[0].text, /Exemplos válidos/)
  })

  it('conciliação: id inexistente vira erro em português, não exceção', async () => {
    const { mcp, container } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })

    for (const name of ['confirmar_conciliacao', 'rejeitar_conciliacao', 'desfazer_conciliacao']) {
      const result = await mcp.call(name, { vinculo: 999 })
      assert.equal(result.isError, true, name)
      assert.match(result.content[0].text, /não encontrad|não foi encontrad/i, name)
    }
  })

  it('sincronizar dispara a sincronização manual e devolve o resultado', async () => {
    const { mcp, container, provider } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })
    provider.transactions.push(tx({ postedAt: '2026-10-04T12:00:00.000Z', amountCents: 1000, description: 'NOVA' }))

    const result = await mcp.call('sincronizar')

    assert.equal(result.isError, undefined)
    assert.equal(result.structuredContent.run.status, 'success')
    assert.equal((await mcp.call('listar_transacoes', { busca: 'nova' })).structuredContent.total, 1)
  })
})

describe('MCP: ajustes da revisão', () => {
  const withFuture = async () => {
    const context = await ready()
    context.provider.transactions.push(
      tx({ postedAt: '2026-12-20T12:00:00.000Z', amountCents: 9900, type: 'DEBIT', description: 'PARCELA FUTURA' }),
    )
    await context.container.sync.run({ trigger: 'manual' })
    return context
  }
  const descriptions = (result: Json) => (result.structuredContent.items as Json[]).map((item) => item.description)

  it('listar_transacoes sem período para em hoje, como a tela de transações', async () => {
    const { mcp } = await withFuture()
    const result = await mcp.call('listar_transacoes')

    assert.ok(!descriptions(result).includes('PARCELA FUTURA'))
    assert.equal(result.structuredContent.total, 2)
  })

  it('lançamentos futuros aparecem quando pedidos ou quando o período os alcança', async () => {
    const { mcp } = await withFuture()

    assert.ok(descriptions(await mcp.call('listar_transacoes', { incluir_futuros: true })).includes('PARCELA FUTURA'))
    assert.ok(descriptions(await mcp.call('listar_transacoes', { mes: '2026-12' })).includes('PARCELA FUTURA'))
    assert.ok(descriptions(await mcp.call('listar_transacoes', { ate: '2026-12-31' })).includes('PARCELA FUTURA'))
    assert.ok(descriptions(await mcp.call('listar_transacoes', { de: '2026-12-01' })).includes('PARCELA FUTURA'))
  })

  it('só POST é aceito: GET e DELETE respondem 405, sem abrir stream', async () => {
    const { app, token } = await ready()
    for (const method of ['GET', 'DELETE', 'PUT']) {
      const response = await app.request('/mcp', {
        method,
        headers: { ...HOST, authorization: `Bearer ${token}`, accept: 'text/event-stream' },
      })
      assert.equal(response.status, 405, method)
      assert.equal(response.headers.get('allow'), 'POST', method)
    }
    // Sem token, a recusa continua sendo de autenticação, para não revelar nada antes dela.
    assert.equal((await app.request('/mcp', { headers: HOST })).status, 401)
  })

  it('decisões de conciliação não se anunciam como repetíveis', async () => {
    const { mcp, container } = await ready()
    container.settings.updateApp({ mcpWriteEnabled: true })
    const tools = (await mcp.rpc('tools/list')).result.tools as Json[]
    const hint = (name: string) => tools.find((tool) => tool.name === name)!.annotations.idempotentHint

    for (const name of ['confirmar_conciliacao', 'rejeitar_conciliacao', 'desfazer_conciliacao']) {
      assert.equal(hint(name), false, name)
    }
    assert.equal(hint('recategorizar_transacao'), true)
  })
})
