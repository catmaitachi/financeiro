import {
  ProviderError,
  type FinancialProvider,
  type ProviderAccount,
  type ProviderCredentials,
  type ProviderTransaction,
} from '../provider.ts'
import { PluggyHttp, type PluggyHttpOptions } from './http.ts'
import {
  normalizeAccount,
  normalizeBill,
  normalizeCategory,
  normalizeItem,
  normalizeTransaction,
} from './normalize.ts'

type Raw = Record<string, unknown>

interface Paged {
  results?: Raw[]
  page?: number
  totalPages?: number
}

interface CursorPage {
  results?: Raw[]
  next?: string | null
}

const PAGE_SIZE = '500'
const OWN_DATA_CONNECTOR = 'MeuPluggy'
const normalizeName = (name: unknown) => String(name ?? '').replace(/\s+/g, '').toLowerCase()
/** Trava de segurança contra paginação que nunca termina. */
const MAX_PAGES = 400

export class PluggyProvider implements FinancialProvider {
  readonly #http: PluggyHttp

  constructor(options: PluggyHttpOptions) {
    this.#http = new PluggyHttp(options)
  }

  resetSession() {
    this.#http.resetSession()
  }

  async verifyCredentials(credentials: ProviderCredentials) {
    await this.#http.authenticate(credentials)
  }

  async createConnectToken(itemId?: string) {
    const data = await this.#http.post<{ accessToken?: string }>('/connect_token', itemId ? { itemId } : {})
    if (!data.accessToken) throw new ProviderError('unexpected', 'A Pluggy não devolveu um Connect Token.')
    return data.accessToken
  }

  /** O MeuPluggy aparece em `GET /connectors` só quando está habilitado na aba Customization do Dashboard. */
  async findOwnDataConnector() {
    const connectors = await this.#paged('/connectors', { name: OWN_DATA_CONNECTOR })
    const found = connectors.find((connector) => normalizeName(connector.name) === normalizeName(OWN_DATA_CONNECTOR))
    return found && typeof found.id === 'number' ? { id: found.id, name: String(found.name) } : null
  }

  async getItem(itemId: string) {
    return normalizeItem(await this.#http.get<Raw>(`/items/${encodeURIComponent(itemId)}`))
  }

  async refreshItem(itemId: string) {
    return normalizeItem(await this.#http.patch<Raw>(`/items/${encodeURIComponent(itemId)}`))
  }

  async deleteItem(itemId: string) {
    await this.#http.delete(`/items/${encodeURIComponent(itemId)}`)
  }

  async listAccounts(itemId: string) {
    return (await this.#paged('/accounts', { itemId })).map(normalizeAccount)
  }

  async listBills(accountId: string) {
    return (await this.#paged('/bills', { accountId })).map((raw) => normalizeBill(raw, accountId))
  }

  async listCategories() {
    return (await this.#paged('/categories', {})).map(normalizeCategory)
  }

  /**
   * `GET /v2/transactions`, paginado por cursor: cada resposta traz em `next`
   * a query string da página seguinte, ou `null` quando acabou.
   */
  async *listTransactions(
    account: ProviderAccount,
    options: { dateFrom: string },
  ): AsyncIterable<ProviderTransaction[]> {
    let query: Record<string, string> = { accountId: account.id, dateFrom: options.dateFrom }
    const seen = new Set<string>()

    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await this.#http.get<CursorPage>('/v2/transactions', query)
      const results = data.results ?? []
      if (results.length) yield results.map((raw) => normalizeTransaction(raw, account))

      if (!data.next) return
      if (seen.has(data.next)) {
        throw new ProviderError('unexpected', 'A Pluggy repetiu o cursor de paginação.')
      }
      seen.add(data.next)
      query = Object.fromEntries(new URLSearchParams(data.next))
    }
    throw new ProviderError('unexpected', 'A paginação de transações não terminou.')
  }

  async #paged(path: string, query: Record<string, string>): Promise<Raw[]> {
    const all: Raw[] = []
    for (let page = 1; page <= MAX_PAGES; page++) {
      const data = await this.#http.get<Paged>(path, { ...query, pageSize: PAGE_SIZE, page: String(page) })
      all.push(...(data.results ?? []))
      if (page >= (data.totalPages ?? 1)) return all
    }
    throw new ProviderError('unexpected', 'A paginação não terminou.')
  }
}
