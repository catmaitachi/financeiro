/**
 * Porta do agregador financeiro.
 *
 * O restante da aplicação só conhece estes tipos, já normalizados (centavos
 * inteiros, datas como texto, nomes neutros). A Pluggy é um adaptador desta
 * porta; trocar ou acrescentar um provedor não toca em sincronização, cálculos
 * nem interface.
 */
import type { Month } from '../../../../shared/months.ts'

export interface ProviderCredentials {
  clientId: string
  clientSecret: string
}

export interface ProviderItem {
  id: string
  institution: { name: string; imageUrl: string | null; color: string | null }
  status: string
  executionStatus: string | null
  error: { code: string | null; message: string | null } | null
  statusDetail: unknown
  updatedAt: string | null
}

export interface ProviderAccount {
  id: string
  itemId: string
  type: 'BANK' | 'CREDIT'
  subtype: string | null
  name: string
  number: string | null
  /** CPF/CNPJ do titular, só dígitos. */
  ownerDocument: string | null
  currencyCode: string
  balanceCents: number
  creditLimitCents: number | null
  brand: string | null
}

export interface ProviderBill {
  id: string
  accountId: string
  /** Datas civis `YYYY-MM-DD`. */
  dueDate: string
  closingDate: string | null
  totalCents: number
  currencyCode: string
}

export interface ProviderTransaction {
  id: string
  accountId: string
  /** Instante bruto informado pelo provedor (ISO 8601). */
  postedAt: string
  description: string
  merchantName: string | null
  /** Sempre positivo; o sentido está em `type`. */
  amountCents: number
  type: 'DEBIT' | 'CREDIT'
  status: 'POSTED' | 'PENDING'
  currencyCode: string
  categoryId: string | null
  /** CPF/CNPJ da outra ponta, só dígitos, quando o provedor informa. */
  counterpartyDocument: string | null
  billId: string | null
  billForecastMonth: Month | null
  installmentNumber: number | null
  totalInstallments: number | null
}

export interface ProviderCategory {
  id: string
  description: string
  descriptionPt: string | null
  parentId: string | null
}

export type ProviderErrorKind =
  | 'invalid_credentials'
  | 'missing_credentials'
  | 'not_found'
  | 'rate_limited'
  | 'unavailable'
  | 'network'
  | 'unexpected'

export class ProviderError extends Error {
  readonly kind: ProviderErrorKind
  readonly status: number | null

  constructor(kind: ProviderErrorKind, message: string, status: number | null = null) {
    super(message)
    this.name = 'ProviderError'
    this.kind = kind
    this.status = status
  }
}

export interface FinancialProvider {
  /** Confere um par de credenciais com o provedor, sem guardar nada. */
  verifyCredentials(credentials: ProviderCredentials): Promise<void>
  /** Token temporário para o widget de conexão. Com `itemId`, abre em modo de atualização. */
  createConnectToken(itemId?: string): Promise<string>
  /**
   * Conector que dá acesso aos dados do próprio titular sem plano pago (na
   * Pluggy, o MeuPluggy). `null` quando não está habilitado para a Application.
   */
  findOwnDataConnector(): Promise<{ id: number; name: string } | null>
  getItem(itemId: string): Promise<ProviderItem>
  /**
   * Pede à instituição uma nova coleta de dados. `null` quando a conexão não
   * aceita esse pedido e se atualiza sozinha no ritmo do provedor (na Pluggy,
   * o MeuPluggy, que busca cada banco uma vez por dia).
   */
  refreshItem(itemId: string): Promise<ProviderItem | null>
  deleteItem(itemId: string): Promise<void>
  listAccounts(itemId: string): Promise<ProviderAccount[]>
  listBills(accountId: string): Promise<ProviderBill[]>
  /** Páginas de transações a partir de `dateFrom` (`YYYY-MM-DD`). */
  listTransactions(account: ProviderAccount, options: { dateFrom: string }): AsyncIterable<ProviderTransaction[]>
  listCategories(): Promise<ProviderCategory[]>
  /** Descarta a sessão em cache (credenciais trocadas ou removidas). */
  resetSession(): void
}
