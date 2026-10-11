/** Lado de leitura do livro-razão: busca, filtros e correções locais. */
import type {
  AccountSummary,
  Category,
  TransactionOverrideInput,
  TransactionPage,
  TransactionQuery,
  TransactionRow,
} from '../../../../shared/api.ts'
import { accountLabel, type BankRef } from '../../../../shared/banks.ts'
import { all, get, run, type Db } from '../../platform/db/database.ts'
import { badRequest, notFound } from '../../platform/http/errors.ts'
import type { BankDirectory } from '../institutions/bank-directory.ts'
import { BILL_MONTH } from './bill-month.ts'
import { localTimeOf } from '../../platform/time.ts'
import { searchText } from './derive.ts'

interface EntryRow {
  id: string
  account_id: string
  account_name: string
  account_type: 'BANK' | 'CREDIT'
  account_number: string | null
  item_id: string
  local_date: string
  posted_at: string
  description: string
  merchant_name: string | null
  amount_cents: number
  direction: 'in' | 'out'
  status: 'POSTED' | 'PENDING'
  currency_code: string
  category_id: string | null
  effective_category_id: string | null
  category_name: string | null
  effective_kind: TransactionRow['kind']
  competence_month: string | null
  bill_month: string | null
  competence_source: TransactionRow['competenceSource']
  included: number
  include_override: number | null
  installment_number: number | null
  total_installments: number | null
  linked_occurrence_id: number | null
  linked_label: string | null
}

const DEFAULT_PAGE_SIZE = 50
const UNKNOWN_BANK: BankRef = { id: 'outro', name: 'Outro banco' }
const MAX_PAGE_SIZE = 200

export class LedgerQueries {
  readonly #db: Db
  readonly #banks: BankDirectory

  constructor(db: Db, banks: BankDirectory) {
    this.#db = db
    this.#banks = banks
  }

  listCategories(): Category[] {
    return all<{ id: string; description: string; description_pt: string | null; parent_id: string | null }>(
      this.#db,
      'SELECT id, description, description_pt, parent_id FROM categories ORDER BY id',
    ).map((row) => ({ id: row.id, name: row.description_pt ?? row.description, parentId: row.parent_id }))
  }

  listAccounts(): AccountSummary[] {
    const banks = this.#banks.byItem()
    return all<{
      id: string
      item_id: string
      type: 'BANK' | 'CREDIT'
      subtype: string | null
      name: string
      number: string | null
      currency_code: string
      balance_cents: number
      credit_limit_cents: number | null
      brand: string | null
    }>(
      this.#db,
      `SELECT a.id, a.item_id, a.type, a.subtype, a.name, a.number,
              a.currency_code, a.balance_cents, a.credit_limit_cents, a.brand
         FROM accounts a
        WHERE a.removed_at IS NULL
        ORDER BY a.type, a.name`,
    )
      .map((row) => {
        const bank = banks.get(row.item_id) ?? UNKNOWN_BANK
        return {
          id: row.id,
          itemId: row.item_id,
          type: row.type,
          subtype: row.subtype,
          name: row.name,
          number: row.number,
          institution: bank.name,
          bank,
          label: accountLabel(row),
          currencyCode: row.currency_code,
          balanceCents: row.balance_cents,
          creditLimitCents: row.credit_limit_cents,
          brand: row.brand,
        }
      })
      .sort((a, b) => a.bank.name.localeCompare(b.bank.name, 'pt-BR'))
  }

  /** Uma categoria e todas as que descendem dela. */
  #categoryFamily(categoryId: string): string[] {
    const children = new Map<string, string[]>()
    for (const category of this.listCategories()) {
      if (!category.parentId) continue
      const siblings = children.get(category.parentId)
      if (siblings) siblings.push(category.id)
      else children.set(category.parentId, [category.id])
    }
    const family: string[] = []
    const queue = [categoryId]
    while (queue.length) {
      const id = queue.pop()!
      family.push(id)
      queue.push(...(children.get(id) ?? []))
    }
    return family
  }

  listTransactions(query: TransactionQuery & { unidentified?: boolean }): TransactionPage {
    const where: string[] = []
    const params: Record<string, unknown> = {}

    if (query.q?.trim()) {
      where.push(`e.search_text LIKE :q ESCAPE '\\'`)
      params.q = `%${searchText(query.q.trim()).replace(/[\\%_]/g, '\\$&')}%`
    }
    if (query.month) {
      where.push(`${BILL_MONTH} = :month`)
      params.month = query.month
    }
    if (query.from) {
      where.push('e.local_date >= :from')
      params.from = query.from
    }
    if (query.to) {
      where.push('e.local_date <= :to')
      params.to = query.to
    }
    if (query.bankId) {
      const items = this.#banks.itemsOf(query.bankId)
      // Banco sem conexão: a lista fica vazia, em vez de ignorar o filtro.
      where.push(items.length ? `e.item_id IN (${items.map((_, i) => `:item${i}`).join(', ')})` : '0 = 1')
      items.forEach((id, i) => (params[`item${i}`] = id))
    }
    if (query.accountType) {
      where.push('e.account_type = :accountType')
      params.accountType = query.accountType
    }
    if (query.accountId) {
      where.push('e.account_id = :accountId')
      params.accountId = query.accountId
    }
    if (query.direction) {
      where.push('e.direction = :direction')
      params.direction = query.direction
    }
    if (query.status) {
      where.push('e.status = :status')
      params.status = query.status
    }
    if (query.unidentified) where.push(`e.competence_source = 'none' AND ${BILL_MONTH} IS NULL`)
    if (query.categoryId) {
      const family = this.#categoryFamily(query.categoryId)
      where.push(`e.effective_category_id IN (${family.map((_, i) => `:category${i}`).join(', ')})`)
      family.forEach((id, i) => (params[`category${i}`] = id))
    }

    const filter = where.length ? `WHERE ${where.join(' AND ')}` : ''
    const pageSize = Math.min(Math.max(query.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE)
    const page = Math.max(query.page ?? 1, 1)

    const summary = get<{ total: number; in_cents: number | null; out_cents: number | null }>(
      this.#db,
      `SELECT COUNT(*) AS total,
              SUM(CASE WHEN e.direction = 'in' AND e.included = 1 AND e.currency_code = 'BRL' THEN e.amount_cents END) AS in_cents,
              SUM(CASE WHEN e.direction = 'out' AND e.included = 1 AND e.currency_code = 'BRL' THEN e.amount_cents END) AS out_cents
         FROM ledger_entries e ${filter}`,
      params,
    )!

    const rows = all<EntryRow>(
      this.#db,
      `SELECT e.id, e.account_id, e.account_name, e.account_type, a.number AS account_number, e.item_id, e.local_date, e.posted_at,
              e.description, e.merchant_name, e.amount_cents, e.direction, e.status, e.currency_code,
              e.category_id, e.effective_category_id, COALESCE(c.description_pt, c.description) AS category_name,
              e.effective_kind, e.competence_month, ${BILL_MONTH} AS bill_month, e.competence_source, e.included, e.include_override,
              e.installment_number, e.total_installments,
              fo.id AS linked_occurrence_id, fs.name AS linked_label
         FROM ledger_entries e
         JOIN accounts a ON a.id = e.account_id
         LEFT JOIN categories c ON c.id = e.effective_category_id
         LEFT JOIN forecast_matches fm ON fm.transaction_id = e.id AND fm.status = 'confirmed'
         LEFT JOIN forecast_occurrences fo ON fo.id = fm.occurrence_id
         LEFT JOIN forecast_series fs ON fs.id = fo.series_id
         ${filter}
        ORDER BY e.local_date DESC, e.posted_at DESC, e.id
        LIMIT :limit OFFSET :offset`,
      { ...params, limit: pageSize, offset: (page - 1) * pageSize },
    )

    const banks = this.#banks.byItem()
    return {
      items: rows.map((row) => toTransactionRow(row, banks.get(row.item_id) ?? UNKNOWN_BANK)),
      total: summary.total,
      page,
      pageSize,
      totals: { inCents: summary.in_cents ?? 0, outCents: summary.out_cents ?? 0 },
    }
  }

  /** Correção local de categoria e de inclusão nos totais. */
  setOverride(transactionId: string, input: TransactionOverrideInput) {
    if (!get(this.#db, 'SELECT 1 AS found FROM transactions WHERE id = :id', { id: transactionId })) {
      throw notFound('Transação não encontrada.')
    }
    if (input.categoryId && !get(this.#db, 'SELECT 1 AS found FROM categories WHERE id = :id', { id: input.categoryId })) {
      throw badRequest('Categoria desconhecida.')
    }

    const current = get<{ category_id: string | null; include_in_totals: number | null }>(
      this.#db,
      'SELECT category_id, include_in_totals FROM transaction_overrides WHERE transaction_id = :id',
      { id: transactionId },
    )
    const categoryId = input.categoryId === undefined ? (current?.category_id ?? null) : input.categoryId
    const include =
      input.includeInTotals === undefined
        ? (current?.include_in_totals ?? null)
        : input.includeInTotals === null
          ? null
          : Number(input.includeInTotals)

    if (categoryId === null && include === null) {
      run(this.#db, 'DELETE FROM transaction_overrides WHERE transaction_id = :id', { id: transactionId })
      return
    }
    run(
      this.#db,
      `INSERT INTO transaction_overrides (transaction_id, category_id, include_in_totals, updated_at)
       VALUES (:id, :categoryId, :include, :now)
       ON CONFLICT (transaction_id) DO UPDATE SET
         category_id = excluded.category_id,
         include_in_totals = excluded.include_in_totals,
         updated_at = excluded.updated_at`,
      { id: transactionId, categoryId, include, now: new Date().toISOString() },
    )
  }
}

function toTransactionRow(row: EntryRow, bank: BankRef): TransactionRow {
  return {
    id: row.id,
    accountId: row.account_id,
    accountName: row.account_name,
    accountLabel: accountLabel({ type: row.account_type, number: row.account_number }),
    accountType: row.account_type,
    institution: bank.name,
    bank,
    date: row.local_date,
    time: localTimeOf(row.posted_at),
    description: row.description,
    merchantName: row.merchant_name,
    amountCents: row.amount_cents,
    direction: row.direction,
    status: row.status,
    currencyCode: row.currency_code,
    categoryId: row.effective_category_id,
    categoryName: row.category_name,
    originalCategoryId: row.category_id,
    kind: row.effective_kind,
    competenceMonth: row.bill_month,
    competenceSource: row.competence_month === null && row.bill_month !== null ? 'cycle' : row.competence_source,
    included: row.included === 1,
    includeOverride: row.include_override === null ? null : row.include_override === 1,
    installment:
      row.installment_number && row.total_installments
        ? { number: row.installment_number, total: row.total_installments }
        : null,
    linkedForecast:
      row.linked_occurrence_id === null
        ? null
        : { occurrenceId: row.linked_occurrence_id, label: row.linked_label ?? 'Previsão' },
  }
}
