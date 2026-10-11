/** Tradução do formato da Pluggy para os tipos neutros da porta do provedor. */
import { isMonth } from '../../../../../shared/months.ts'
import { localDateOf } from '../../../platform/time.ts'
import type {
  ProviderAccount,
  ProviderBill,
  ProviderCategory,
  ProviderItem,
  ProviderTransaction,
} from '../provider.ts'

type Raw = Record<string, unknown>

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null

const object = (value: unknown): Raw => (value && typeof value === 'object' ? (value as Raw) : {})

const integer = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null

const digits = (value: unknown): string | null => {
  const only = typeof value === 'string' ? value.replace(/\D/g, '') : ''
  return only || null
}

/** A Pluggy trabalha com decimais; internamente tudo é centavo inteiro. */
export function toCents(amount: unknown): number {
  return typeof amount === 'number' && Number.isFinite(amount) ? Math.round(amount * 100) : 0
}

export function normalizeItem(raw: Raw): ProviderItem {
  const connector = object(raw.connector)
  const error = raw.error ? object(raw.error) : null
  return {
    id: String(raw.id),
    institution: {
      name: text(connector.name) ?? 'Instituição',
      imageUrl: text(connector.imageUrl),
      color: text(connector.primaryColor),
    },
    status: text(raw.status) ?? 'UPDATING',
    executionStatus: text(raw.executionStatus),
    error: error ? { code: text(error.code), message: text(error.message) } : null,
    statusDetail: raw.statusDetail ?? null,
    updatedAt: text(raw.lastUpdatedAt) ?? text(raw.updatedAt),
  }
}

export function normalizeAccount(raw: Raw): ProviderAccount {
  const credit = object(raw.creditData)
  const type = raw.type === 'CREDIT' ? 'CREDIT' : 'BANK'
  return {
    id: String(raw.id),
    itemId: String(raw.itemId),
    type,
    subtype: text(raw.subtype),
    name: text(raw.marketingName) ?? text(raw.name) ?? (type === 'CREDIT' ? 'Cartão' : 'Conta'),
    number: text(raw.number),
    ownerDocument: digits(raw.taxNumber),
    currencyCode: text(raw.currencyCode) ?? 'BRL',
    balanceCents: toCents(raw.balance),
    creditLimitCents: type === 'CREDIT' && credit.creditLimit != null ? toCents(credit.creditLimit) : null,
    brand: text(credit.brand),
  }
}

export function normalizeBill(raw: Raw, accountId: string): ProviderBill {
  return {
    id: String(raw.id),
    accountId,
    dueDate: localDateOf(String(raw.dueDate)),
    closingDate: text(raw.billClosingDate) ? localDateOf(String(raw.billClosingDate)) : null,
    totalCents: toCents(raw.totalAmount),
    currencyCode: text(raw.totalAmountCurrencyCode) ?? 'BRL',
  }
}

export function normalizeTransaction(raw: Raw, account: ProviderAccount): ProviderTransaction {
  const amount = typeof raw.amount === 'number' ? raw.amount : 0
  const payment = object(raw.paymentData)
  const card = object(raw.creditCardMetadata)
  const merchant = object(raw.merchant)

  // `type` é a fonte primária. Sem ele, o sinal decide: em conta, negativo é
  // saída; em cartão, positivo é compra (saída) e negativo é pagamento/estorno.
  const type: ProviderTransaction['type'] =
    raw.type === 'DEBIT' || raw.type === 'CREDIT'
      ? raw.type
      : (account.type === 'CREDIT' ? amount > 0 : amount < 0)
        ? 'DEBIT'
        : 'CREDIT'

  const counterparty = object(type === 'CREDIT' ? payment.payer : payment.receiver)
  const forecast = text(card.billForecastDate)?.slice(0, 7) ?? null

  return {
    id: String(raw.id),
    accountId: account.id,
    postedAt: String(raw.date),
    description: text(raw.description) ?? text(raw.descriptionRaw) ?? 'Sem descrição',
    merchantName: text(merchant.name) ?? text(merchant.businessName),
    amountCents: Math.abs(toCents(amount)),
    type,
    status: raw.status === 'PENDING' ? 'PENDING' : 'POSTED',
    currencyCode: text(raw.currencyCode) ?? account.currencyCode,
    categoryId: text(raw.categoryId),
    counterpartyDocument: digits(object(counterparty.documentNumber).value),
    billId: text(card.billId),
    billForecastMonth: isMonth(forecast) ? forecast : null,
    installmentNumber: integer(card.installmentNumber),
    totalInstallments: integer(card.totalInstallments),
  }
}

export function normalizeCategory(raw: Raw): ProviderCategory {
  return {
    id: String(raw.id),
    description: text(raw.description) ?? String(raw.id),
    descriptionPt: text(raw.descriptionTranslated),
    parentId: text(raw.parentId),
  }
}
