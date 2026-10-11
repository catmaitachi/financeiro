import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'
import { createApp } from '../src/app.ts'
import { MemorySecretStore } from '../src/modules/credentials/secret-store.ts'
import { ProviderError } from '../src/modules/provider/provider.ts'
import { AppError } from '../src/platform/http/errors.ts'
import { redact, type Logger } from '../src/platform/logger.ts'
import { FakeProvider, seeded, setup, tx, VALID } from './support.ts'

const HOST = { host: 'localhost:8787' }

function capturingLogger() {
  const lines: string[] = []
  const write = (message: string, meta?: Record<string, unknown>) => lines.push(`${message} ${JSON.stringify(redact(meta ?? {}))}`)
  const logger: Logger = { info: write, warn: write, error: write }
  return { logger, lines }
}

describe('credenciais da Pluggy', () => {
  it('primeiro acesso sem credenciais: estado "missing", que leva a /setup', async () => {
    const { container } = setup()
    const response = await createApp(container).request('/api/setup/status', { headers: HOST })

    assert.equal(response.status, 200)
    assert.deepEqual(await response.json(), {
      state: 'missing',
      source: null,
      vault: 'memory',
      checkedAt: null,
      hasConnections: false,
    })
  })

  it('credenciais incompletas são reconhecidas como tal', async () => {
    const { container } = setup({ env: { PLUGGY_CLIENT_ID: VALID.clientId } })
    assert.equal((await container.credentials.status()).state, 'incomplete')
  })

  it('credenciais recusadas não são armazenadas e a mensagem diz o que fazer', async () => {
    const { container, secretStore } = setup()

    await assert.rejects(
      container.credentials.save({ clientId: VALID.clientId, clientSecret: 'segredo-errado-0000' }),
      (error) =>
        error instanceof AppError &&
        error.code === 'credentials_rejected' &&
        /recusou/.test(error.message) &&
        /Client ID e o Client Secret são da mesma Application/.test(error.message),
    )
    assert.deepEqual(await secretStore.read(), { clientId: null, clientSecret: null })
    assert.equal((await container.credentials.status()).state, 'missing')
  })

  it('formato inválido é recusado antes de qualquer chamada à Pluggy', async () => {
    const { container, provider } = setup()
    await assert.rejects(
      container.credentials.save({ clientId: 'nao-e-um-uuid', clientSecret: VALID.clientSecret }),
      (error) => error instanceof AppError && error.code === 'invalid_client_id',
    )
    await assert.rejects(
      container.credentials.save({ clientId: VALID.clientId, clientSecret: 'com espaço' }),
      (error) => error instanceof AppError && error.code === 'invalid_client_secret',
    )
    assert.equal(provider.calls.verify, 0)
  })

  it('sem conexão com a Pluggy, nada é salvo', async () => {
    const { container, provider, secretStore } = setup()
    provider.failWith = new ProviderError('network', 'Sem rede.')

    await assert.rejects(container.credentials.save(VALID), (error) => error instanceof AppError && error.status === 503)
    assert.deepEqual(await secretStore.read(), { clientId: null, clientSecret: null })
  })

  it('credenciais válidas sobrevivem ao reinício sem aparecer no banco nem nos logs', async () => {
    const secretStore = new MemorySecretStore()
    const { logger, lines } = capturingLogger()
    const first = setup({ secretStore, logger })

    const saved = await first.container.credentials.save({ ...VALID, clientSecret: `  ${VALID.clientSecret}  ` })
    assert.deepEqual({ state: saved.state, source: saved.source }, { state: 'valid', source: 'vault' })

    // "Reinício": outro processo, outro banco, mesmo cofre.
    const restarted = setup({ secretStore })
    assert.equal((await restarted.container.credentials.status()).state, 'valid')

    const dump = JSON.stringify(
      first.db
        .prepare(`SELECT name FROM sqlite_master WHERE type = 'table'`)
        .all()
        .map((table) => first.db.prepare(`SELECT * FROM "${table.name}"`).all()),
    )
    assert.ok(!dump.includes(VALID.clientSecret), 'o Client Secret não pode estar no banco')
    assert.ok(!dump.includes(VALID.clientId), 'o Client ID não pode estar no banco')
    assert.ok(dump.includes('credential_source'), 'o banco guarda só a fonte ativa')
    assert.ok(lines.length > 0)
    assert.ok(lines.every((line) => !line.includes(VALID.clientSecret) && !line.includes(VALID.clientId)))
  })

  it('o cofre tem precedência sobre as variáveis de ambiente', async () => {
    const secretStore = new MemorySecretStore()
    const env = { PLUGGY_CLIENT_ID: VALID.clientId, PLUGGY_CLIENT_SECRET: VALID.clientSecret }
    const { container } = setup({ secretStore, env })
    assert.equal((await container.credentials.status()).source, 'env')

    await container.credentials.save(VALID)
    assert.equal((await container.credentials.status()).source, 'vault')

    // Removidas do cofre, as do ambiente voltam a valer.
    assert.equal((await container.credentials.remove()).source, 'env')
  })

  it('credenciais do ambiente rejeitadas pela Pluggy ficam como "invalid"', async () => {
    const { container } = setup({ env: { CLIENT_ID: VALID.clientId, CLIENT_SECRET: 'segredo-antigo-0000' } })
    assert.deepEqual(
      (({ state, source }) => ({ state, source }))(await container.credentials.status()),
      { state: 'invalid', source: 'env' },
    )
  })

  it('Pluggy fora do ar não invalida as credenciais', async () => {
    const provider = new FakeProvider()
    provider.failWith = new ProviderError('network', 'Sem rede.')
    const { container } = setup({ provider, env: { PLUGGY_CLIENT_ID: VALID.clientId, PLUGGY_CLIENT_SECRET: VALID.clientSecret } })
    assert.equal((await container.credentials.status()).state, 'unreachable')
  })

  it('reaproveita a checagem recente em vez de autenticar a cada consulta', async () => {
    const { container, provider, secretStore, setNow } = setup()
    await secretStore.write(VALID)

    await container.credentials.status()
    await container.credentials.status()
    assert.equal(provider.calls.verify, 1)

    await container.credentials.status({ force: true })
    assert.equal(provider.calls.verify, 2)

    setNow('2026-10-08T16:00:00.000Z')
    await container.credentials.status()
    assert.equal(provider.calls.verify, 3)
  })

  it('remover as credenciais preserva transações e previsões locais', async () => {
    const context = seeded()
    await context.container.credentials.save(VALID)
    context.provider.transactions = [tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 })]
    await context.container.sync.run({ trigger: 'manual' })
    context.container.forecasts.create({ expression: '300*3' })

    const status = await context.container.credentials.remove()

    assert.equal(status.state, 'missing')
    assert.equal(context.container.ledger.listTransactions({}).total, 1)
    assert.equal(context.container.forecasts.list()[0]?.occurrences.length, 3)
    assert.equal(context.container.connections.list().length, 1)
    assert.equal(context.container.dashboard.build('2026-10').totals.expenseCents, 1000)
  })
})

describe('fronteira com o navegador', () => {
  it('nenhuma rota devolve Client Secret ou API Key', async () => {
    const context = seeded()
    await context.container.credentials.save(VALID)
    const app = createApp(context.container)

    const bodies: string[] = []
    for (const path of ['/api/setup/status', '/api/settings', '/api/pluggy/connections', '/api/sync', '/api/dashboard']) {
      const response = await app.request(path, { headers: HOST })
      assert.equal(response.status, 200, path)
      bodies.push(await response.text())
    }
    const saved = await app.request('/api/setup/credentials', {
      method: 'POST',
      headers: { ...HOST, 'content-type': 'application/json' },
      body: JSON.stringify(VALID),
    })
    bodies.push(await saved.text())
    const token = await app.request('/api/pluggy/connect-token', {
      method: 'POST',
      headers: { ...HOST, 'content-type': 'application/json' },
      body: '{}',
    })
    const tokenBody = await token.text()

    for (const body of [...bodies, tokenBody]) {
      assert.ok(!body.includes(VALID.clientSecret))
      assert.ok(!/apiKey|clientSecret/i.test(body))
    }
    // O Connect Token temporário é a única credencial que chega ao navegador.
    assert.deepEqual(JSON.parse(tokenBody), {
      connectToken: 'connect-token-temporario',
      includeSandbox: false,
      connectorIds: [200],
      selectedConnectorId: 200,
    })
  })

  it('recusa requisições que não sejam locais', async () => {
    const { container } = setup()
    const app = createApp(container)

    const rebinding = await app.request('/api/setup/status', { headers: { host: 'financeiro.atacante.example' } })
    assert.equal(rebinding.status, 403)

    const crossSite = await app.request('/api/sync', {
      method: 'POST',
      headers: { ...HOST, origin: 'https://site-qualquer.example', 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(crossSite.status, 403)

    const local = await app.request('/api/sync', {
      method: 'POST',
      headers: { ...HOST, origin: 'http://localhost:5173', 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(local.status, 200)
  })

  it('a interface compilada é servida sem deixar escapar arquivos de fora dela', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'financeiro-dist-'))
    const dist = path.join(root, 'dist')
    fs.mkdirSync(path.join(dist, 'assets'), { recursive: true })
    fs.writeFileSync(path.join(dist, 'index.html'), '<!doctype html><title>Financeiro</title>')
    fs.writeFileSync(path.join(dist, 'assets', 'app.js'), 'console.log(1)')
    fs.writeFileSync(path.join(root, 'segredo.txt'), 'fora-da-interface')
    try {
      const { container } = setup()
      const app = createApp({ ...container, config: { ...container.config, webDistDir: dist } })
      const get = (target: string) => app.request(target, { headers: HOST })

      assert.match(await (await get('/')).text(), /Financeiro/)
      // Rotas da interface caem no index.html; o roteamento acontece no navegador.
      assert.match(await (await get('/previsoes')).text(), /Financeiro/)
      const asset = await get('/assets/app.js')
      assert.equal(asset.headers.get('content-type'), 'text/javascript; charset=utf-8')
      assert.match(asset.headers.get('cache-control') ?? '', /immutable/)

      for (const attempt of ['/../segredo.txt', '/%2e%2e/segredo.txt', '/assets/..%2f..%2fsegredo.txt']) {
        const body = await (await get(attempt)).text()
        assert.ok(!body.includes('fora-da-interface'), attempt)
      }
    } finally {
      fs.rmSync(root, { recursive: true, force: true })
    }
  })

  it('sem credenciais, operações que dependem da Pluggy pedem configuração', async () => {
    const provider = new FakeProvider()
    provider.failWith = new ProviderError('missing_credentials', 'As credenciais da Pluggy não estão configuradas.')
    const { container } = setup({ provider })

    const response = await createApp(container).request('/api/pluggy/connect-token', {
      method: 'POST',
      headers: { ...HOST, 'content-type': 'application/json' },
      body: '{}',
    })
    assert.equal(response.status, 401)
    assert.equal(((await response.json()) as { error: { code: string } }).error.code, 'credentials_required')
  })

  it('erros de validação voltam em português, no formato padrão', async () => {
    const { container } = setup()
    const app = createApp(container)

    const month = await app.request('/api/dashboard?month=2026-13', { headers: HOST })
    assert.equal(month.status, 400)
    assert.match(((await month.json()) as { error: { message: string } }).error.message, /AAAA-MM/)

    const expression = await app.request('/api/forecasts', {
      method: 'POST',
      headers: { ...HOST, 'content-type': 'application/json' },
      body: JSON.stringify({ expression: '300*200' }),
    })
    assert.equal(expression.status, 422)
    assert.equal(((await expression.json()) as { error: { code: string } }).error.code, 'forecast_invalid_count')
  })
})
