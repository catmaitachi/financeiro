/**
 * Cliente da API local. É a única porta da interface para os dados: o
 * navegador nunca fala com a Pluggy diretamente, exceto pelo widget oficial
 * de conexão, que recebe um Connect Token temporário.
 */
import type {
  AccountSummary,
  ApiErrorBody,
  AppSettings,
  Category,
  Connection,
  ConnectSession,
  Dashboard,
  ForecastCreateInput,
  ForecastSeries,
  McpConnectionKit,
  McpInfo,
  OccurrenceManualStatus,
  OccurrenceUpdateInput,
  ForecastScope,
  ReconciliationQueue,
  SetupStatus,
  SyncResponse,
  SyncState,
  TransactionOverrideInput,
  TransactionPage,
  TransactionQuery,
} from '@shared/api'
import type { Month } from '@shared/months'

export class ApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(status: number, code: string, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
  }
}

/** Avisa a aplicação de que a Pluggy recusou as credenciais (leva de volta a /setup). */
export const CREDENTIALS_REQUIRED_EVENT = 'financeiro:credentials-required'

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/api${path}`, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    })
  } catch {
    throw new ApiError(0, 'server_unreachable', 'O servidor local não respondeu. Confira se a aplicação está rodando.')
  }

  if (response.ok) return (response.status === 204 ? undefined : await response.json()) as T

  const payload = (await response.json().catch(() => null)) as ApiErrorBody | null
  const error = new ApiError(
    response.status,
    payload?.error.code ?? 'unknown',
    payload?.error.message ?? 'Algo deu errado. Tente de novo.',
  )
  if (error.code === 'credentials_required') window.dispatchEvent(new Event(CREDENTIALS_REQUIRED_EVENT))
  throw error
}

function queryString(params: object): string {
  const search = new URLSearchParams()
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '' && value !== false) search.set(key, String(value))
  }
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const api = {
  setup: {
    status: () => request<SetupStatus>('GET', '/setup/status'),
    test: () => request<SetupStatus>('POST', '/setup/test'),
    save: (credentials: { clientId: string; clientSecret: string }) =>
      request<SetupStatus>('POST', '/setup/credentials', credentials),
    remove: () => request<SetupStatus>('DELETE', '/setup/credentials'),
  },
  settings: {
    get: () => request<AppSettings>('GET', '/settings'),
    update: (patch: Partial<AppSettings>) => request<AppSettings>('PATCH', '/settings', patch),
  },
  mcp: {
    info: () => request<McpInfo>('GET', '/mcp'),
    /** Contém o token: usar só para copiar, sem guardar em estado nem em cache. */
    connectionKit: () => request<McpConnectionKit>('POST', '/mcp/connection-kit'),
    rotateToken: () => request<McpInfo>('POST', '/mcp/token'),
  },
  connections: {
    list: () => request<Connection[]>('GET', '/pluggy/connections'),
    connectSession: (itemId?: string) => request<ConnectSession>('POST', '/pluggy/connect-token', { itemId }),
    register: (itemId: string) => request<Connection[]>('POST', '/pluggy/items', { itemId }),
    refresh: (itemId: string) => request<Connection[]>('POST', `/pluggy/connections/${itemId}/refresh`),
    remove: (itemId: string) => request<Connection[]>('DELETE', `/pluggy/connections/${itemId}`),
  },
  sync: {
    state: () => request<SyncState>('GET', '/sync'),
    run: (trigger: 'open' | 'manual') => request<SyncResponse>('POST', '/sync', { trigger }),
  },
  dashboard: (month?: Month, windowEnd?: Month) =>
    request<Dashboard>('GET', `/dashboard${queryString({ month, windowEnd })}`),
  transactions: {
    list: (query: TransactionQuery) => request<TransactionPage>('GET', `/transactions${queryString(query)}`),
    override: (id: string, input: TransactionOverrideInput) =>
      request<void>('PATCH', `/transactions/${id}/override`, input),
  },
  categories: () => request<Category[]>('GET', '/categories'),
  accounts: () => request<AccountSummary[]>('GET', '/accounts'),
  forecasts: {
    list: () => request<{ series: ForecastSeries[]; defaultStartMonth: Month }>('GET', '/forecasts'),
    create: (input: ForecastCreateInput) => request<ForecastSeries>('POST', '/forecasts', input),
    rename: (seriesId: number, name: string | null) => request<void>('PATCH', `/forecasts/${seriesId}`, { name }),
    remove: (seriesId: number) => request<void>('DELETE', `/forecasts/${seriesId}`),
    updateOccurrence: (id: number, input: OccurrenceUpdateInput) =>
      request<void>('PATCH', `/forecasts/occurrences/${id}`, input),
    cancelOccurrence: (id: number, scope: ForecastScope) =>
      request<void>('DELETE', `/forecasts/occurrences/${id}${queryString({ scope })}`),
    setStatus: (id: number, status: OccurrenceManualStatus) =>
      request<void>('POST', `/forecasts/occurrences/${id}/status`, { status }),
  },
  reconciliation: {
    queue: () => request<ReconciliationQueue>('GET', '/reconciliation'),
    confirm: (matchId: number) => request<void>('POST', `/reconciliation/${matchId}/confirm`),
    reject: (matchId: number) => request<void>('POST', `/reconciliation/${matchId}/reject`),
    undo: (matchId: number) => request<void>('POST', `/reconciliation/${matchId}/undo`),
  },
}
