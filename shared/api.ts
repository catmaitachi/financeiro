/**
 * Contrato HTTP entre o servidor local e a interface.
 * Só tipos: nada aqui chega ao bundle do navegador como código.
 */
import type { BankRef } from './banks.ts'
import type { ForecastMode } from './forecast-expression.ts'
import type { Month } from './months.ts'

export interface ApiErrorBody {
  error: { code: string; message: string; details?: unknown }
}

// --- Configuração e credenciais -------------------------------------------

/** `vault` é o cofre do sistema (qual deles está em `SecretVault`); `env`, as variáveis de ambiente. */
export type CredentialSource = 'vault' | 'env'

/**
 * Cofre em uso para os segredos cadastrados pela interface:
 * - `keychain`: Keychain do macOS;
 * - `dpapi`: arquivo cifrado pelo Windows para o usuário atual;
 * - `libsecret`: chaveiro do Linux (GNOME Keyring, KWallet);
 * - `file`: arquivo local com permissão restrita, quando não há cofre do sistema;
 * - `memory`: só em testes.
 */
export type SecretVault = 'keychain' | 'dpapi' | 'libsecret' | 'file' | 'memory'

/**
 * `unreachable` significa que a Pluggy não respondeu: as credenciais podem
 * estar corretas, então a aplicação segue funcionando com os dados locais.
 */
export type CredentialState = 'missing' | 'incomplete' | 'valid' | 'invalid' | 'unreachable'

export interface SetupStatus {
  state: CredentialState
  source: CredentialSource | null
  vault: SecretVault
  hasConnections: boolean
  checkedAt: string | null
}

/**
 * Quais instituições o Pluggy Connect oferece ao conectar:
 * - `meupluggy`: só o MeuPluggy, o acesso gratuito aos dados do próprio titular;
 * - `sandbox`: lista completa mais os bancos fictícios da Pluggy, para testes;
 * - `all`: lista completa (bancos diretos e Open Finance exigem plano pago).
 */
export type ConnectScope = 'meupluggy' | 'sandbox' | 'all'

export interface AppSettings {
  connectScope: ConnectScope
  /** Libera aos agentes (MCP) as ferramentas que alteram dados. Desligado por padrão. */
  mcpWriteEnabled: boolean
}

/** O que o navegador precisa para abrir o Pluggy Connect. Nada aqui é credencial duradoura. */
export interface ConnectSession {
  connectToken: string
  includeSandbox: boolean
  /** Quando preenchido, o widget só oferece estes conectores. */
  connectorIds: number[] | null
  /** Quando preenchido, o widget pula a escolha de instituição e abre neste conector. */
  selectedConnectorId: number | null
}

// --- Conexões ---------------------------------------------------------------

export type AccountType = 'BANK' | 'CREDIT'

export interface AccountSummary {
  id: string
  itemId: string
  type: AccountType
  subtype: string | null
  name: string
  number: string | null
  /** Nome padronizado do banco (igual a `bank.name`). */
  institution: string
  bank: BankRef
  /** Nome padronizado dentro do banco: "Conta" ou "Cartão final 0422". */
  label: string
  currencyCode: string
  balanceCents: number
  creditLimitCents: number | null
  brand: string | null
}

export type ConnectionLevel = 'ok' | 'updating' | 'attention' | 'error'
export type ConnectionAction = 'none' | 'wait' | 'retry' | 'reconnect' | 'mfa'

export interface ConnectionHealth {
  level: ConnectionLevel
  action: ConnectionAction
  title: string
  detail: string | null
}

export interface Connection {
  id: string
  institution: { name: string; imageUrl: string | null; color: string | null }
  status: string
  executionStatus: string | null
  health: ConnectionHealth
  providerUpdatedAt: string | null
  lastSyncedAt: string | null
  lastSyncError: string | null
  accounts: AccountSummary[]
}

/** Resposta de "Atualizar" numa conexão. */
export interface RefreshResult {
  /**
   * A instituição recebeu o pedido de nova coleta. `false` quando a conexão
   * não aceita o pedido (o MeuPluggy busca os bancos sozinho, uma vez por dia)
   * e só se copiou de novo o que ele já tem.
   */
  requested: boolean
  connections: Connection[]
}

// --- Sincronização ----------------------------------------------------------

export type SyncTrigger = 'open' | 'manual' | 'connect'
export type SyncStatus = 'running' | 'success' | 'partial' | 'failed'

export interface SyncItemResult {
  itemId: string
  institution: string
  ok: boolean
  /** A instituição ainda estava atualizando ou entregou só parte dos produtos. */
  partial: boolean
  error: string | null
  accounts: number
  transactionsUpserted: number
  transactionsRemoved: number
}

export interface SyncRun {
  id: number
  trigger: SyncTrigger
  status: SyncStatus
  startedAt: string
  finishedAt: string | null
  items: SyncItemResult[]
  reconciliation: { autoMatched: number; suggested: number }
  error: string | null
}

export interface SyncResponse {
  /** `true` quando a última sincronização é recente e a abertura do painel não disparou outra. */
  skipped: boolean
  run: SyncRun | null
}

export interface SyncState {
  running: boolean
  lastRun: SyncRun | null
  lastSuccessAt: string | null
}

// --- Painel -----------------------------------------------------------------

export interface MonthTotals {
  expenseCents: number
  incomeReceivedCents: number
  incomeForecastCents: number
  balanceCents: number
}

export interface CategorySlice {
  categoryId: string | null
  name: string
  cents: number
}

export interface AccountSlice {
  accountId: string
  name: string
  institution: string
  inCents: number
  outCents: number
}

export interface CardSlice {
  accountId: string
  name: string
  institution: string
  brand: string | null
  expenseCents: number
  /** Parte ainda em fatura aberta (lançamentos pendentes). */
  openCents: number
  dueDate: string | null
}

/**
 * A fatura que interessa agora em um cartão: a fechada que ainda vence, ou, se
 * ela já foi paga (ou já venceu), a que está em aberto para o mês seguinte.
 */
export interface BillSummary {
  accountId: string
  name: string
  institution: string
  brand: string | null
  /** Mês de vencimento da fatura mostrada. */
  month: Month
  amountCents: number
  /** `closed`: fechada, aguardando pagamento. `open`: ainda recebendo compras. */
  state: 'closed' | 'open'
  dueDate: string | null
  /** O vencimento foi estimado pelo dia da fatura anterior. */
  dueDateEstimated: boolean
  /** A fatura anterior foi paga: é por isso que esta é a mostrada. */
  previousPaid: boolean
}

export type BillStatus = 'paid' | 'closed' | 'open'

/** A fatura de um banco em um mês de vencimento, somando os cartões dele. */
export interface BankBill {
  month: Month
  amountCents: number
  /** `paid`: paga. `closed`: fechada, aguardando pagamento. `open`: ainda recebendo compras. */
  status: BillStatus
  dueDate: string | null
  /**
   * O banco ainda não entregou esta fatura: o valor vem das compras feitas
   * depois do último fechamento e as datas repetem o ciclo anterior.
   */
  estimated: boolean
  paidOn: string | null
}

/** Um banco no painel: saldo em conta, fatura do mês e a seguinte. */
export interface BankSummary {
  bank: BankRef
  /** Saldo das contas do banco; `null` quando ele só tem cartão. */
  balanceCents: number | null
  cards: { accountId: string; label: string; brand: string | null }[]
  /** Fatura que vence no mês em foco do painel. */
  bill: BankBill | null
  /** Fatura do mês seguinte ao mês em foco. */
  next: BankBill | null
}

export interface BankShare {
  bankId: string
  cents: number
}

/** Uma categoria da fatura unificada, com a parte de cada banco. */
export interface BillCategory extends CategorySlice {
  byBank: BankShare[]
}

export interface Dashboard {
  month: Month
  currentMonth: Month
  /**
   * Mês em que o painel se concentra: o atual enquanto alguma fatura dele
   * estiver por pagar; quando todas estão pagas, o seguinte.
   */
  focusMonth: Month
  /** Bancos conectados, com a fatura do mês em foco; não dependem da competência exibida. */
  banks: BankSummary[]
  /** Faturas de cada mês do ano da competência exibida, divididas por banco. */
  billYear: { month: Month; totalCents: number; byBank: BankShare[] }[]
  /** A fatura unificada da competência exibida, por categoria. */
  billCategories: BillCategory[]
  /** Faturas atuais dos cartões; não dependem da competência exibida. */
  bills: BillSummary[]
  /** Soma dos saldos das contas bancárias em reais. */
  bankBalanceCents: number
  totals: MonthTotals
  previous: MonthTotals
  byCategory: CategorySlice[]
  byAccount: AccountSlice[]
  byCard: CardSlice[]
  pending: { count: number; inCents: number; outCents: number }
  unidentifiedBill: { count: number; cents: number }
  otherCurrencies: { currencyCode: string; count: number; inCents: number; outCents: number }[]
  history: { month: Month; incomeCents: number; expenseCents: number }[]
  /** Saldo das previsões realizadas no mês: entradas menos saídas. */
  forecasts: {
    openCount: number
    /** Entradas e saídas previstas ainda em aberto na competência, ambas em valor positivo. */
    openInCents: number
    openOutCents: number
    overdueCount: number
    receivedCents: number
  }
  reviewCount: number
  hasData: boolean
}

// --- Transações -------------------------------------------------------------

export type TransactionKind = 'regular' | 'bill_payment' | 'internal_transfer'
/** `cycle`: o banco ainda não informou a fatura; o mês vem do ciclo do cartão (compra depois do último fechamento). */
export type CompetenceSource = 'date' | 'bill' | 'forecast' | 'cycle' | 'none'
export type Direction = 'in' | 'out'
export type TransactionStatus = 'POSTED' | 'PENDING'

export interface TransactionRow {
  id: string
  accountId: string
  accountName: string
  /** Nome padronizado dentro do banco: "Conta" ou "Cartão final 0422". */
  accountLabel: string
  accountType: AccountType
  /** Nome padronizado do banco (igual a `bank.name`). */
  institution: string
  bank: BankRef
  date: string
  /** `HH:mm` em America/Sao_Paulo; `null` quando o banco só informou o dia. */
  time: string | null
  description: string
  merchantName: string | null
  amountCents: number
  direction: Direction
  status: TransactionStatus
  currencyCode: string
  categoryId: string | null
  categoryName: string | null
  originalCategoryId: string | null
  kind: TransactionKind
  competenceMonth: Month | null
  competenceSource: CompetenceSource
  /** Entra nos totais consolidados (já considerando a correção local, se houver). */
  included: boolean
  /** Correção local: `null` segue a regra automática. */
  includeOverride: boolean | null
  installment: { number: number; total: number } | null
  linkedForecast: { occurrenceId: number; label: string } | null
}

export interface TransactionQuery {
  q?: string
  /** Filtra pelo mês da fatura, em cartões, e pelo mês da data, em contas. */
  month?: Month
  from?: string
  to?: string
  /** Todas as contas e cartões de um banco. */
  bankId?: string
  /** Só contas (`BANK`) ou só cartões (`CREDIT`). */
  accountType?: AccountType
  accountId?: string
  categoryId?: string
  direction?: Direction
  status?: TransactionStatus
  /** Só lançamentos de cartão sem competência confiável ("Fatura não identificada"). */
  unidentified?: boolean
  page?: number
  pageSize?: number
}

export interface TransactionPage {
  items: TransactionRow[]
  total: number
  page: number
  pageSize: number
  totals: { inCents: number; outCents: number }
}

export interface Category {
  id: string
  name: string
  parentId: string | null
}

export interface TransactionOverrideInput {
  /** `undefined` mantém, `null` volta à categoria original. */
  categoryId?: string | null
  /** `undefined` mantém, `null` volta à regra automática. */
  includeInTotals?: boolean | null
}

// --- Previsões --------------------------------------------------------------

export type ForecastFrequency = 'monthly' | 'weekly' | 'daily'

export type OccurrenceStatus = 'expected' | 'received_auto' | 'received_manual' | 'ignored' | 'cancelled'
/** `overdue` é derivado: prevista cujo dia (ou, sem dia, cuja competência) já passou. */
export type OccurrenceDisplayStatus = OccurrenceStatus | 'overdue'

export interface LinkedTransaction {
  matchId: number
  id: string
  date: string
  description: string
  accountName: string
  institution: string
}

export interface ForecastOccurrence {
  id: number
  seriesId: number
  seriesName: string | null
  /** Posição na série, começando em 1. */
  sequence: number
  seriesSize: number
  /** A série continua gerando ocorrências: `seriesSize` é só o que já foi criado. */
  recurring: boolean
  frequency: ForecastFrequency
  month: Month
  /** Data esperada, `YYYY-MM-DD`. Nula quando a previsão só tem competência. */
  day: string | null
  amountCents: number
  status: OccurrenceStatus
  displayStatus: OccurrenceDisplayStatus
  linkedTransaction: LinkedTransaction | null
}

export interface ForecastSeries {
  id: number
  name: string | null
  expression: string
  mode: ForecastMode
  /** Na recorrente, o valor de cada ocorrência. */
  totalCents: number
  /** Repete a cada período até ser encerrada. */
  recurring: boolean
  frequency: ForecastFrequency
  /** Dia do mês de uma previsão mensal com dia; nulo nas demais. */
  dayOfMonth: number | null
  startMonth: Month
  createdAt: string
  occurrences: ForecastOccurrence[]
}

export interface ForecastCreateInput {
  expression: string
  name?: string | null
  /** Padrão: mensal. */
  frequency?: ForecastFrequency
  /** Só na mensal. */
  startMonth?: Month
  /** Só na mensal, opcional: fixa o dia de cada competência (1 a 31). */
  dayOfMonth?: number
  /** Data da primeira ocorrência. Obrigatória na semanal e na diária. */
  startDay?: string
}

export type ForecastScope = 'one' | 'future'

export interface OccurrenceUpdateInput {
  scope: ForecastScope
  amountCents?: number
  /** Só na mensal. */
  month?: Month
  /** Nova data; `null` tira o dia (só na mensal). */
  day?: string | null
}

export type OccurrenceManualStatus = 'expected' | 'received_manual' | 'ignored'

// --- Assinaturas ------------------------------------------------------------

export type SubscriptionCadence = 'weekly' | 'monthly' | 'yearly'
/** `suggested` espera a confirmação do vínculo; `dismissed` não volta a ser sugerida. */
export type SubscriptionStatus = 'suggested' | 'confirmed' | 'dismissed' | 'ended'

export interface SubscriptionCharge {
  transactionId: string
  date: string
  description: string
  amountCents: number
  /** Vinculada à mão pelo usuário (a detecção não mexe nela). */
  manual: boolean
}

/** Saída do extrato que pode ser vinculada à mão como cobrança de uma assinatura. */
export interface SubscriptionChargeCandidate {
  transactionId: string
  date: string
  description: string
  amountCents: number
  bank: BankRef
  /** "Conta" ou "Cartão final 0422". */
  accountLabel: string
  /** Já é cobrança de outra assinatura: precisa ser desvinculada lá antes. */
  linkedTo: { subscriptionId: number; name: string } | null
}

export interface Subscription {
  id: number
  name: string
  /** Domínio do serviço, de onde vem o logotipo. Nulo quando não se sabe. */
  domain: string | null
  cadence: SubscriptionCadence
  /** Valor da cobrança mais recente, sempre positivo. */
  amountCents: number
  status: SubscriptionStatus
  /** Onde a cobrança cai. Nulos se a conta foi removida. */
  bank: BankRef | null
  accountLabel: string | null
  onCard: boolean
  lastChargeDate: string
  /** Próxima cobrança esperada, pela cadência. */
  nextChargeDate: string
  /** Sem cobrança há mais de dois ciclos: provavelmente foi cancelada. */
  stale: boolean
  /** Cobranças vinculadas, da mais recente para a mais antiga. */
  charges: SubscriptionCharge[]
}

export interface SubscriptionList {
  /** Sugeridas e confirmadas. Dispensadas e encerradas não aparecem. */
  subscriptions: Subscription[]
  /** Quanto as confirmadas e ativas custam por mês (semanal e anual convertidas). */
  monthlyCents: number
}

export interface SubscriptionUpdateInput {
  name?: string
  /** Endereço do serviço; `null` remove o logotipo. */
  domain?: string | null
  /** De quanto em quanto tempo a cobrança vem. A próxima data passa a seguir a nova frequência. */
  cadence?: SubscriptionCadence
}

// --- Calendário -------------------------------------------------------------

/** Fechamento da fatura de um banco: a partir deste dia as compras vão para a seguinte. */
export interface BillClosingEvent {
  kind: 'bill_closing'
  date: string
  bank: BankRef
  amountCents: number
  /** O banco ainda não entregou esta fatura: a data repete o ciclo anterior. */
  estimated: boolean
}

export interface BillDueEvent {
  kind: 'bill_due'
  date: string
  bank: BankRef
  amountCents: number
  status: BillStatus
  estimated: boolean
}

export interface SubscriptionEvent {
  kind: 'subscription'
  date: string
  subscriptionId: number
  name: string
  domain: string | null
  amountCents: number
  /** `true`: cobrança já lançada. `false`: esperada pela cadência. */
  charged: boolean
  bank: BankRef | null
}

/** Previsão com dia definido. As que só têm competência não entram no calendário. */
export interface ForecastEvent {
  kind: 'forecast'
  date: string
  occurrenceId: number
  name: string | null
  /** Assinado: negativo é saída. */
  amountCents: number
  status: OccurrenceDisplayStatus
}

export type CalendarEvent = BillClosingEvent | BillDueEvent | SubscriptionEvent | ForecastEvent

export interface CalendarRange {
  from: string
  to: string
  today: string
  /** Em ordem de data. */
  events: CalendarEvent[]
}

// --- Conciliação ------------------------------------------------------------

export type MatchReason = 'ambiguous' | 'out_of_month'

export interface ReviewCandidate {
  matchId: number
  reason: MatchReason
  transaction: {
    id: string
    date: string
    description: string
    accountName: string
    institution: string
    amountCents: number
  }
}

export interface ReviewItem {
  occurrence: ForecastOccurrence
  candidates: ReviewCandidate[]
}

export interface ReconciliationQueue {
  items: ReviewItem[]
}

// --- Agentes (MCP) ----------------------------------------------------------

/** O que a interface mostra sobre o acesso dos agentes. Nunca inclui o token inteiro. */
export interface McpInfo {
  url: string
  /** Começo e fim do token, só para reconhecê-lo. */
  tokenPreview: string
  writeEnabled: boolean
}

/** Tudo o que um agente precisa para se conectar, nos formatos que a interface copia. Contém o token. */
export interface McpConnectionKit {
  url: string
  token: string
  /** Comando para colar no terminal do Claude Code. */
  claudeCodeCommand: string
  /** Bloco `mcpServers`, no formato do `.mcp.json`. */
  jsonConfig: string
  /** Texto em português para colar numa conversa com qualquer agente. */
  agentPrompt: string
}
