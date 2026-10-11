import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { createApp } from '../src/app.ts'
import { buildConnectionKit } from '../src/modules/mcp/connection-kit.ts'
import { setup } from './support.ts'

const HOST = { host: 'localhost:8787' }
const URL = 'http://127.0.0.1:8787/mcp'
const TOKEN = 'fin_token-de-teste_0123456789abcdefghijklmnopqrs'

type Json = Record<string, any>

const tokenAccepted = async (app: ReturnType<typeof createApp>, token: string) =>
  (
    await app.request('/mcp', {
      method: 'POST',
      headers: { ...HOST, authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }),
    })
  ).status === 200

describe('kit de conexão do MCP', () => {
  const kit = buildConnectionKit({ url: URL, token: TOKEN })

  it('o comando do Claude Code leva URL, transporte e cabeçalho de autorização', () => {
    assert.equal(
      kit.claudeCodeCommand,
      `claude mcp add --transport http financeiro ${URL} --header "Authorization: Bearer ${TOKEN}"`,
    )
  })

  it('o JSON é válido e segue o formato do .mcp.json', () => {
    assert.deepEqual(JSON.parse(kit.jsonConfig), {
      mcpServers: {
        financeiro: { type: 'http', url: URL, headers: { Authorization: `Bearer ${TOKEN}` } },
      },
    })
  })

  it('o prompt para o agente traz os dados da conexão e as precauções', () => {
    assert.ok(kit.agentPrompt.includes(URL))
    assert.ok(kit.agentPrompt.includes(`Authorization: Bearer ${TOKEN}`))
    assert.ok(kit.agentPrompt.includes(kit.claudeCodeCommand))
    assert.match(kit.agentPrompt, /centavos/)
    assert.match(kit.agentPrompt, /confirm/i)
    assert.match(kit.agentPrompt, /segredo/i)
  })

  it('devolve também a URL e o token separados', () => {
    assert.equal(kit.url, URL)
    assert.equal(kit.token, TOKEN)
  })
})

describe('administração do MCP', () => {
  it('GET /api/mcp mostra URL, prévia e interruptor, nunca o token inteiro', async () => {
    const { container } = setup()
    const token = await container.mcpToken.current()
    const response = await createApp(container).request('/api/mcp', { headers: HOST })
    const body = (await response.json()) as Json

    assert.equal(response.status, 200)
    assert.equal(body.url, URL)
    assert.equal(body.writeEnabled, false)
    assert.equal(body.tokenPreview, await container.mcpToken.preview())
    assert.ok(!JSON.stringify(body).includes(token))
  })

  it('POST /api/mcp/connection-kit entrega o kit e o token do kit autentica de verdade', async () => {
    const { container } = setup()
    const app = createApp(container)
    const response = await app.request('/api/mcp/connection-kit', { method: 'POST', headers: HOST })
    const kit = (await response.json()) as Json

    assert.equal(response.status, 200)
    assert.equal(kit.url, URL)
    assert.ok(kit.claudeCodeCommand.includes(kit.token))
    assert.equal(await tokenAccepted(app, kit.token), true)
  })

  it('o kit não pode ser lido por outra página aberta no navegador', async () => {
    const { container } = setup()
    const app = createApp(container)

    const foreign = await app.request('/api/mcp/connection-kit', {
      method: 'POST',
      headers: { ...HOST, origin: 'https://site-qualquer.example' },
    })
    assert.equal(foreign.status, 403)
    assert.ok(!(await foreign.text()).includes(await container.mcpToken.current()))

    // GET nunca devolve o kit: só POST, que passa pela checagem de origem.
    const read = await app.request('/api/mcp/connection-kit', { headers: HOST })
    assert.ok(!(read.headers.get('content-type') ?? '').includes('json'))
    assert.ok(!(await read.text()).includes(await container.mcpToken.current()))
  })

  it('a própria interface local consegue pedir o kit', async () => {
    const { container } = setup()
    const response = await createApp(container).request('/api/mcp/connection-kit', {
      method: 'POST',
      headers: { ...HOST, origin: 'http://localhost:5173' },
    })

    assert.equal(response.status, 200)
  })

  it('POST /api/mcp/token troca o token: o antigo para de valer e o novo vale', async () => {
    const { container } = setup()
    const app = createApp(container)
    const old = await container.mcpToken.current()

    const response = await app.request('/api/mcp/token', { method: 'POST', headers: HOST })
    const info = (await response.json()) as Json

    assert.equal(response.status, 200)
    assert.ok(!JSON.stringify(info).includes(await container.mcpToken.current()))
    assert.equal(await tokenAccepted(app, old), false)
    assert.equal(await tokenAccepted(app, await container.mcpToken.current()), true)
  })

  it('o interruptor de escrita liga e desliga pelas configurações', async () => {
    const { container } = setup()
    const app = createApp(container)
    const patch = (mcpWriteEnabled: boolean) =>
      app.request('/api/settings', {
        method: 'PATCH',
        headers: { ...HOST, 'content-type': 'application/json' },
        body: JSON.stringify({ mcpWriteEnabled }),
      })

    assert.equal(((await (await patch(true)).json()) as Json).mcpWriteEnabled, true)
    assert.equal(((await (await app.request('/api/mcp', { headers: HOST })).json()) as Json).writeEnabled, true)
    assert.equal(((await (await patch(false)).json()) as Json).mcpWriteEnabled, false)
  })
})
