import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET } from '../../../scripts/mock-fixtures.ts'
import { mockPluggy } from '../../../scripts/mock-pluggy-app.ts'
import { seedMockData, type ApiCall } from '../../../scripts/mock-seed-steps.ts'
import { createApi } from '../../../server/src/api.ts'
import type { Config } from '../../../server/src/config.ts'
import { createContainer } from '../../../server/src/container.ts'
import { CredentialSource } from '../../../server/src/modules/credentials/credential-source.ts'
import { MemorySecretStore } from '../../../server/src/modules/credentials/secret-store.ts'
import { MemoryMcpTokenStore } from '../../../server/src/modules/mcp/token-store.ts'
import { PluggyProvider } from '../../../server/src/modules/provider/pluggy/pluggy-provider.ts'
import { migrate } from '../../../server/src/platform/db/database.ts'
import { silentLogger } from '../../../server/src/platform/logger.ts'
import { systemClock } from '../../../server/src/platform/time.ts'
import { openBrowserDatabase } from './sqlite.ts'

/** Endereços que só existem dentro da aba: nenhuma requisição da demo sai para a rede. */
const API_ORIGIN = 'http://financeiro.demo'
const PLUGGY_ORIGIN = 'http://pluggy.demo'

const CONFIG: Config = {
  rootDir: '/',
  host: '127.0.0.1',
  port: 8787,
  dbPath: ':memory:',
  secretsDir: '/',
  webDistDir: '/',
  pluggyApiUrl: PLUGGY_ORIGIN,
  keychainService: 'financeiro-demo',
  initialHistoryDays: 365,
  lookbackDays: 90,
  openSyncMinIntervalMs: 10 * 60 * 1000,
}

export type DemoBackend = (path: string, init?: RequestInit) => Promise<Response>

/** As etapas da partida, para a tela de carregamento dizer o que está acontecendo. */
export type DemoStep = 'database' | 'banks'

/**
 * Sobe, dentro do navegador, o mesmo servidor do aplicativo: mesmas rotas,
 * regras e migrações, sobre um SQLite em memória e o simulador da Pluggy.
 * Devolve a função que atende as chamadas a `/api`.
 */
export async function startDemoBackend(onStep: (step: DemoStep) => void = () => {}): Promise<DemoBackend> {
  onStep('database')
  const db = await openBrowserDatabase()
  migrate(db)

  const secretStore = new MemorySecretStore()
  await secretStore.write({ clientId: MOCK_CLIENT_ID, clientSecret: MOCK_CLIENT_SECRET })
  const credentials = new CredentialSource(secretStore, {})

  const container = createContainer({
    config: CONFIG,
    db,
    secretStore,
    mcpTokenStore: new MemoryMcpTokenStore(),
    clock: systemClock,
    logger: silentLogger,
    provider: new PluggyProvider({
      baseUrl: PLUGGY_ORIGIN,
      getCredentials: () => credentials.active(),
      fetch: async (input, init) => mockPluggy.fetch(new Request(input, init)),
    }),
  })

  const api = createApi(container)
  const backend: DemoBackend = async (path, init) => api.fetch(new Request(`${API_ORIGIN}/api${path}`, init))

  const call: ApiCall = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
    const response = await backend(path, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
    if (!response.ok) throw new Error(`${method} ${path} -> ${response.status}`)
    return (response.status === 204 ? null : await response.json()) as T
  }
  onStep('banks')
  await seedMockData(call)

  return backend
}
