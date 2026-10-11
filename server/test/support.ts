/** Apoio aos testes: provedor em memória e composição com banco `:memory:`. */
import { loadConfig } from '../src/config.ts'
import { createContainer } from '../src/container.ts'
import { MemorySecretStore, type SecretStore } from '../src/modules/credentials/secret-store.ts'
import { MemoryMcpTokenStore } from '../src/modules/mcp/token-store.ts'
import {
  ProviderError,
  type FinancialProvider,
  type ProviderAccount,
  type ProviderBill,
  type ProviderCategory,
  type ProviderCredentials,
  type ProviderItem,
  type ProviderTransaction,
} from '../src/modules/provider/provider.ts'
import { openDatabase } from '../src/platform/db/database.ts'
import { silentLogger, type Logger } from '../src/platform/logger.ts'

export const VALID: ProviderCredentials = {
  clientId: '11111111-2222-4333-8444-555555555555',
  clientSecret: 'segredo-de-teste-0001',
}

export const ITEM = 'aaaaaaaa-0000-4000-8000-000000000001'
export const CHECKING = 'bbbbbbbb-0000-4000-8000-000000000001'
export const SAVINGS = 'bbbbbbbb-0000-4000-8000-000000000002'
export const CARD = 'cccccccc-0000-4000-8000-000000000001'
export const OWNER_CPF = '12345678901'

let sequence = 0
export const uuid = () => `dddddddd-0000-4000-8000-${String(++sequence).padStart(12, '0')}`

export const CATEGORIES: ProviderCategory[] = [
  { id: '01000000', description: 'Income', descriptionPt: 'Renda', parentId: null },
  { id: '04000000', description: 'Same person transfer', descriptionPt: 'Transferência mesma titularidade', parentId: null },
  { id: '04020000', description: 'Same person transfer - PIX', descriptionPt: 'Transferência mesma titularidade - PIX', parentId: '04000000' },
  { id: '05000000', description: 'Transfers', descriptionPt: 'Transferências', parentId: null },
  { id: '05070000', description: 'Transfer - PIX', descriptionPt: 'Transferência - PIX', parentId: '05000000' },
  { id: '05100000', description: 'Credit card payment', descriptionPt: 'Pagamento de cartão de crédito', parentId: '05000000' },
  { id: '10000000', description: 'Groceries', descriptionPt: 'Mercado', parentId: null },
  { id: '11000000', description: 'Food and drinks', descriptionPt: 'Alimentação', parentId: null },
  { id: '11010000', description: 'Eating out', descriptionPt: 'Restaurantes', parentId: '11000000' },
]

export function bankAccount(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: CHECKING,
    itemId: ITEM,
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '0001/12345-6',
    ownerDocument: OWNER_CPF,
    currencyCode: 'BRL',
    balanceCents: 0,
    creditLimitCents: null,
    brand: null,
    ...overrides,
  }
}

export function cardAccount(overrides: Partial<ProviderAccount> = {}): ProviderAccount {
  return {
    id: CARD,
    itemId: ITEM,
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    name: 'Cartão Platinum',
    number: '1234',
    ownerDocument: OWNER_CPF,
    currencyCode: 'BRL',
    balanceCents: 0,
    creditLimitCents: 1_000_000,
    brand: 'MASTERCARD',
    ...overrides,
  }
}

export function tx(overrides: Partial<ProviderTransaction> & { postedAt: string; amountCents: number }): ProviderTransaction {
  return {
    id: uuid(),
    accountId: CHECKING,
    description: 'Lançamento',
    merchantName: null,
    type: 'DEBIT',
    status: 'POSTED',
    currencyCode: 'BRL',
    categoryId: null,
    counterpartyDocument: null,
    billId: null,
    billForecastMonth: null,
    installmentNumber: null,
    totalInstallments: null,
    ...overrides,
  }
}

/** Agregador falso: guarda tudo em memória e pagina de verdade. */
export class FakeProvider implements FinancialProvider {
  items = new Map<string, ProviderItem>()
  accounts: ProviderAccount[] = []
  bills: ProviderBill[] = []
  transactions: ProviderTransaction[] = []
  categories: ProviderCategory[] = CATEGORIES
  pageSize = 500
  /** Erro lançado por qualquer chamada autenticada, quando definido. */
  failWith: ProviderError | null = null
  /** Erro lançado só ao listar transações desta conta. */
  failTransactionsFor: string | null = null
  /** Conector de dados próprios habilitado na Application; `null` simula o MeuPluggy desligado. */
  ownDataConnector: { id: number; name: string } | null = { id: 200, name: 'MeuPluggy' }
  calls = { verify: 0, transactionPages: 0, connectTokens: 0 }

  addItem(overrides: Partial<ProviderItem> = {}): ProviderItem {
    const item: ProviderItem = {
      id: ITEM,
      institution: { name: 'Banco Exemplo', imageUrl: null, color: null },
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
      error: null,
      statusDetail: null,
      updatedAt: '2026-10-01T12:00:00.000Z',
      ...overrides,
    }
    this.items.set(item.id, item)
    return item
  }

  resetSession() {}

  async verifyCredentials(credentials: ProviderCredentials) {
    this.calls.verify++
    if (this.failWith?.kind === 'network') throw this.failWith
    if (credentials.clientId !== VALID.clientId || credentials.clientSecret !== VALID.clientSecret) {
      throw new ProviderError('invalid_credentials', 'A Pluggy recusou as credenciais.', 401)
    }
  }

  async createConnectToken() {
    this.#guard()
    this.calls.connectTokens++
    return 'connect-token-temporario'
  }

  async findOwnDataConnector() {
    this.#guard()
    return this.ownDataConnector
  }

  async getItem(itemId: string) {
    this.#guard()
    const item = this.items.get(itemId)
    if (!item) throw new ProviderError('not_found', 'A Pluggy não encontrou este recurso.', 404)
    return item
  }

  async refreshItem(itemId: string) {
    return this.getItem(itemId)
  }

  async deleteItem(itemId: string) {
    this.#guard()
    this.items.delete(itemId)
  }

  async listAccounts(itemId: string) {
    this.#guard()
    return this.accounts.filter((account) => account.itemId === itemId)
  }

  async listBills(accountId: string) {
    this.#guard()
    return this.bills.filter((bill) => bill.accountId === accountId)
  }

  async listCategories() {
    this.#guard()
    return this.categories
  }

  async *listTransactions(account: ProviderAccount, options: { dateFrom: string }) {
    this.#guard()
    if (this.failTransactionsFor === account.id) {
      throw new ProviderError('unavailable', 'A Pluggy está indisponível no momento.', 503)
    }
    const matching = this.transactions.filter(
      (item) => item.accountId === account.id && item.postedAt.slice(0, 10) >= options.dateFrom,
    )
    for (let offset = 0; offset < matching.length; offset += this.pageSize) {
      this.calls.transactionPages++
      yield matching.slice(offset, offset + this.pageSize)
    }
  }

  #guard() {
    if (this.failWith) throw this.failWith
  }
}

export interface TestOptions {
  now?: string
  provider?: FakeProvider
  secretStore?: SecretStore
  env?: NodeJS.ProcessEnv
  logger?: Logger
}

export function setup(options: TestOptions = {}) {
  const state = { now: new Date(options.now ?? '2026-10-08T15:00:00.000Z') }
  const db = openDatabase(':memory:')
  const provider = options.provider ?? new FakeProvider()
  const secretStore = options.secretStore ?? new MemorySecretStore()
  const container = createContainer({
    config: loadConfig({}),
    db,
    secretStore,
    mcpTokenStore: new MemoryMcpTokenStore(),
    clock: () => state.now,
    logger: options.logger ?? silentLogger,
    env: options.env ?? {},
    provider,
  })
  return {
    db,
    provider,
    secretStore,
    container,
    setNow: (iso: string) => {
      state.now = new Date(iso)
    },
  }
}

/** Cenário mínimo: um Item com conta corrente e cartão. */
export function seeded(options: TestOptions = {}) {
  const context = setup(options)
  context.provider.addItem()
  context.provider.accounts = [bankAccount(), cardAccount()]
  // O Item precisa existir localmente, como depois do widget de conexão.
  context.db
    .prepare(`INSERT INTO pluggy_items (id, connector_name, status, created_at) VALUES (?, 'Banco Exemplo', 'UPDATED', ?)`)
    .run(ITEM, '2026-10-01T00:00:00.000Z')
  return context
}
