/** Camada HTTP da Pluggy: sessão (API Key), novas tentativas e tradução de erros. */
import { ProviderError, type ProviderCredentials } from '../provider.ts'

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>

export interface PluggyHttpOptions {
  baseUrl: string
  fetch?: FetchLike
  /** Credenciais ativas no momento da chamada (cofre ou ambiente). */
  getCredentials: () => Promise<ProviderCredentials | null>
  now?: () => number
  sleep?: (ms: number) => Promise<void>
}

/** A API Key vale 2 horas; é renovada um pouco antes de expirar. */
const API_KEY_TTL_MS = 2 * 60 * 60 * 1000
const API_KEY_RENEW_MARGIN_MS = 5 * 60 * 1000
const REQUEST_TIMEOUT_MS = 30_000
const MAX_RETRIES = 2

interface RequestOptions {
  body?: unknown
  query?: Record<string, string | undefined>
}

export class PluggyHttp {
  readonly #baseUrl: string
  readonly #fetch: FetchLike
  readonly #getCredentials: PluggyHttpOptions['getCredentials']
  readonly #now: () => number
  readonly #sleep: (ms: number) => Promise<void>
  #session: { apiKey: string; expiresAt: number } | null = null
  #authenticating: Promise<string> | null = null

  constructor(options: PluggyHttpOptions) {
    this.#baseUrl = options.baseUrl
    this.#fetch = options.fetch ?? ((input, init) => fetch(input, init))
    this.#getCredentials = options.getCredentials
    this.#now = options.now ?? Date.now
    this.#sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)))
  }

  resetSession() {
    this.#session = null
    this.#authenticating = null
  }

  /** Troca um par de credenciais por uma API Key. Não altera a sessão em uso. */
  async authenticate(credentials: ProviderCredentials): Promise<string> {
    const response = await this.#send('POST', '/auth', {
      body: { clientId: credentials.clientId, clientSecret: credentials.clientSecret },
    })
    if (response.status === 400 || response.status === 401 || response.status === 403) {
      throw new ProviderError('invalid_credentials', 'A Pluggy recusou as credenciais.', response.status)
    }
    const data = await this.#readJson(response)
    if (typeof data.apiKey !== 'string' || !data.apiKey) {
      throw new ProviderError('unexpected', 'A Pluggy não devolveu uma API Key.', response.status)
    }
    return data.apiKey
  }

  get<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    return this.#authorized('GET', path, { query })
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.#authorized('POST', path, { body: body ?? {} })
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.#authorized('PATCH', path, { body: body ?? {} })
  }

  delete<T>(path: string): Promise<T> {
    return this.#authorized('DELETE', path, {})
  }

  async #authorized<T>(method: string, path: string, options: RequestOptions): Promise<T> {
    let response = await this.#send(method, path, options, await this.#apiKey())
    if (response.status === 401 || response.status === 403) {
      // A chave pode ter sido revogada antes do prazo: renova uma única vez.
      this.#session = null
      response = await this.#send(method, path, options, await this.#apiKey())
    }
    return (await this.#readJson(response)) as T
  }

  async #apiKey(): Promise<string> {
    if (this.#session && this.#now() < this.#session.expiresAt - API_KEY_RENEW_MARGIN_MS) {
      return this.#session.apiKey
    }
    // Chamadas simultâneas compartilham a mesma autenticação.
    this.#authenticating ??= (async () => {
      try {
        const credentials = await this.#getCredentials()
        if (!credentials) {
          throw new ProviderError('missing_credentials', 'As credenciais da Pluggy não estão configuradas.')
        }
        const apiKey = await this.authenticate(credentials)
        this.#session = { apiKey, expiresAt: this.#now() + API_KEY_TTL_MS }
        return apiKey
      } finally {
        this.#authenticating = null
      }
    })()
    return this.#authenticating
  }

  async #send(method: string, path: string, options: RequestOptions, apiKey?: string): Promise<Response> {
    const url = new URL(this.#baseUrl + path)
    for (const [key, value] of Object.entries(options.query ?? {})) {
      if (value !== undefined) url.searchParams.set(key, value)
    }
    const headers: Record<string, string> = { Accept: 'application/json' }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (apiKey) headers['X-API-KEY'] = apiKey

    for (let attempt = 0; ; attempt++) {
      let response: Response
      try {
        response = await this.#fetch(url.toString(), {
          method,
          headers,
          body: options.body === undefined ? undefined : JSON.stringify(options.body),
          signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        })
      } catch {
        if (attempt < MAX_RETRIES) {
          await this.#sleep(500 * 2 ** attempt)
          continue
        }
        throw new ProviderError('network', 'Não foi possível falar com a Pluggy. Verifique sua conexão.')
      }

      const retriable = response.status === 429 || response.status >= 500
      if (retriable && attempt < MAX_RETRIES) {
        const retryAfter = Number(response.headers.get('retry-after'))
        await this.#sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? Math.min(retryAfter, 5) * 1000 : 500 * 2 ** attempt)
        continue
      }
      return response
    }
  }

  async #readJson(response: Response): Promise<Record<string, unknown>> {
    if (response.ok) {
      if (response.status === 204) return {}
      try {
        return (await response.json()) as Record<string, unknown>
      } catch {
        throw new ProviderError('unexpected', 'A Pluggy devolveu uma resposta ilegível.', response.status)
      }
    }
    const { status } = response
    if (status === 401 || status === 403) {
      throw new ProviderError('invalid_credentials', 'A Pluggy recusou as credenciais.', status)
    }
    if (status === 404) throw new ProviderError('not_found', 'A Pluggy não encontrou este recurso.', status)
    if (status === 429) {
      throw new ProviderError('rate_limited', 'A Pluggy limitou as requisições. Tente de novo em instantes.', status)
    }
    if (status >= 500) {
      throw new ProviderError('unavailable', 'A Pluggy está indisponível no momento.', status)
    }
    throw new ProviderError('unexpected', `A Pluggy respondeu com um erro inesperado (${status}).`, status)
  }
}
