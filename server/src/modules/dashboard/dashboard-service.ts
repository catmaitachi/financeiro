import type {
  BankBill,
  BankShare,
  BankSummary,
  BillCategory,
  BillSummary,
  CardSlice,
  CategorySlice,
  Dashboard,
  MonthTotals,
} from '../../../../shared/api.ts'
import { accountLabel, type BankRef } from '../../../../shared/banks.ts'
import { addMonths, monthDiff, monthOfDate, monthsEndingAt, type Month } from '../../../../shared/months.ts'
import type { BankDirectory } from '../institutions/bank-directory.ts'
import { BILL_MONTH } from '../ledger/bill-month.ts'
import { all, get, type Db } from '../../platform/db/database.ts'
import { currentMonth, todayLocal, type Clock } from '../../platform/time.ts'

/**
 * O que conta como "realizado" na consolidação:
 * - está incluído nos totais (regra automática ou correção local);
 * - é em reais (outras moedas aparecem à parte);
 * - em conta, só o confirmado; em cartão, vale o mês da fatura, aberta ou fechada.
 */
const REALIZED = `e.included = 1 AND e.currency_code = 'BRL' AND (e.account_type = 'CREDIT' OR e.status = 'POSTED')`

/** Gasto líquido: saídas menos estornos de cartão. */
const EXPENSE = `CASE
  WHEN e.direction = 'out' THEN e.amount_cents
  WHEN e.account_type = 'CREDIT' THEN -e.amount_cents
  ELSE 0 END`

const INCOME = `CASE WHEN e.account_type = 'BANK' AND e.direction = 'in' THEN e.amount_cents ELSE 0 END`

/** Compras de cartão em reais, com o mês da fatura a que pertencem (`bill_month`). */
const CARD_ENTRIES = `
  WITH card_entries AS (
    SELECT e.*, ${BILL_MONTH} AS bill_month
      FROM ledger_entries e
     WHERE e.account_type = 'CREDIT' AND e.currency_code = 'BRL' AND e.effective_kind <> 'bill_payment'
  )`

const HISTORY_MONTHS = 12
const UNCATEGORIZED = 'Sem categoria'
const UNKNOWN_BANK: BankRef = { id: 'outro', name: 'Outro banco' }

/** Desloca uma data civil em meses, mantendo o dia quando ele existe no mês de destino. */
function shiftDate(date: string, months: number): string {
  const month = addMonths(monthOfDate(date), months)
  const lastDay = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
  return `${month}-${String(Math.min(Number(date.slice(8, 10)), lastDay)).padStart(2, '0')}`
}

interface BillRow {
  due_date: string
  closing_date: string | null
  total_cents: number
}

/** Soma as partes por banco, da maior para a menor. */
function shares(byBank: Map<string, number>): BankShare[] {
  return [...byBank]
    .filter(([, cents]) => cents !== 0)
    .map(([bankId, cents]) => ({ bankId, cents }))
    .sort((a, b) => b.cents - a.cents)
}

export class DashboardService {
  readonly #db: Db
  readonly #clock: Clock
  readonly #banks: BankDirectory
  readonly #reviewCount: () => number

  constructor(db: Db, clock: Clock, banks: BankDirectory, reviewCount: () => number) {
    this.#db = db
    this.#clock = clock
    this.#banks = banks
    this.#reviewCount = reviewCount
  }

  /**
   * @param month competência exibida
   * @param windowEnd último mês da faixa de 12 meses do histórico; por padrão,
   *   o mês seguinte ao atual (ou a própria competência, se ela for posterior)
   */
  build(month: Month, windowEnd?: Month): Dashboard {
    const thisMonth = currentMonth(this.#clock)
    const upcoming = addMonths(thisMonth, 1)
    const lastMonth = windowEnd ?? (month > upcoming ? month : upcoming)
    const previousMonth = addMonths(month, -1)

    const realized = this.#realized([previousMonth, month])
    const forecastByMonth = this.#openForecasts([previousMonth, month])
    const totalsOf = (target: Month): MonthTotals => {
      const incomeReceivedCents = realized.get(target)?.incomeCents ?? 0
      const expenseCents = realized.get(target)?.expenseCents ?? 0
      return {
        expenseCents,
        incomeReceivedCents,
        incomeForecastCents: forecastByMonth.get(target) ?? 0,
        balanceCents: incomeReceivedCents - expenseCents,
      }
    }

    const window = monthsEndingAt(lastMonth, HISTORY_MONTHS)
    const history = this.#realized(window)

    return {
      month,
      currentMonth: thisMonth,
      banks: this.#bankSummaries(),
      billYear: this.#billYear(month.slice(0, 4)),
      billCategories: this.#billCategories(month),
      bills: this.#bills(),
      bankBalanceCents:
        get<{ total: number | null }>(
          this.#db,
          `SELECT SUM(balance_cents) AS total FROM accounts WHERE type = 'BANK' AND currency_code = 'BRL' AND removed_at IS NULL`,
        )?.total ?? 0,
      totals: totalsOf(month),
      previous: totalsOf(previousMonth),
      byCategory: this.#byCategory(month),
      byAccount: this.#byAccount(month),
      byCard: this.#byCard(month),
      pending: this.#pending(month),
      unidentifiedBill: this.#unidentifiedBill(),
      otherCurrencies: this.#otherCurrencies(month),
      history: window.map((entry) => ({
        month: entry,
        incomeCents: history.get(entry)?.incomeCents ?? 0,
        expenseCents: history.get(entry)?.expenseCents ?? 0,
      })),
      forecasts: this.#forecasts(month, thisMonth),
      reviewCount: this.#reviewCount(),
      hasData: get(this.#db, 'SELECT 1 AS found FROM transactions LIMIT 1') !== undefined,
    }
  }

  /**
   * Cada banco conectado com o saldo em conta, a fatura que vence neste mês e
   * a do mês seguinte. Os cartões de um mesmo banco somam em uma fatura só.
   */
  #bankSummaries(): BankSummary[] {
    const today = todayLocal(this.#clock)
    const thisMonth = monthOfDate(today)
    const banks = this.#banks.byItem()
    const summaries = new Map<string, BankSummary & { bills: BankBill[]; nexts: BankBill[] }>()

    for (const account of all<{
      id: string
      item_id: string
      type: 'BANK' | 'CREDIT'
      number: string | null
      brand: string | null
      balance_cents: number
      currency_code: string
    }>(
      this.#db,
      `SELECT id, item_id, type, number, brand, balance_cents, currency_code
         FROM accounts WHERE removed_at IS NULL ORDER BY name`,
    )) {
      const bank = banks.get(account.item_id) ?? UNKNOWN_BANK
      const summary = summaries.get(bank.id) ?? { bank, balanceCents: null, cards: [], bill: null, next: null, bills: [], nexts: [] }
      summaries.set(bank.id, summary)
      if (account.type === 'BANK') {
        if (account.currency_code === 'BRL') summary.balanceCents = (summary.balanceCents ?? 0) + account.balance_cents
        continue
      }
      summary.cards.push({ accountId: account.id, label: accountLabel(account), brand: account.brand })
      const current = this.#cardBill(account.id, thisMonth, today)
      const next = this.#cardBill(account.id, addMonths(thisMonth, 1), today)
      if (current) summary.bills.push(current)
      if (next) summary.nexts.push(next)
    }

    return [...summaries.values()]
      .map(({ bills, nexts, ...summary }) => ({ ...summary, bill: mergeBills(bills), next: mergeBills(nexts) }))
      .sort((a, b) => (b.bill?.amountCents ?? 0) - (a.bill?.amountCents ?? 0) || a.bank.name.localeCompare(b.bank.name, 'pt-BR'))
  }

  /**
   * A fatura de um cartão com vencimento no mês pedido.
   *
   * Se o banco já a entregou, valem o total e as datas dela. Se não, o valor é
   * a soma das compras daquele ciclo e as datas repetem o ciclo da última
   * fatura conhecida. A Pluggy não informa se uma fatura foi paga: considera-se
   * paga quando o cartão recebeu um pagamento depois do fechamento dela.
   */
  #cardBill(accountId: string, month: Month, today: string): BankBill | null {
    const record = get<BillRow>(
      this.#db,
      `SELECT due_date, closing_date, total_cents FROM bills
        WHERE account_id = :accountId AND currency_code = 'BRL' AND substr(due_date, 1, 7) = :month
        ORDER BY due_date DESC LIMIT 1`,
      { accountId, month },
    )
    const last = get<BillRow>(
      this.#db,
      `SELECT due_date, closing_date, total_cents FROM bills
        WHERE account_id = :accountId AND currency_code = 'BRL' ORDER BY due_date DESC LIMIT 1`,
      { accountId },
    )

    let amountCents: number
    let closing: string | null
    let dueDate: string | null
    if (record) {
      amountCents = record.total_cents
      closing = record.closing_date ?? record.due_date
      dueDate = record.due_date
    } else {
      if (last && month < monthOfDate(last.due_date)) return null
      const open = get<{ total: number | null; entries: number }>(
        this.#db,
        `${CARD_ENTRIES}
         SELECT SUM(${EXPENSE}) AS total, COUNT(*) AS entries FROM card_entries e
          WHERE e.account_id = :accountId AND e.bill_month = :month`,
        { accountId, month },
      )
      if (!last && !open?.entries) return null
      amountCents = open?.total ?? 0
      const ahead = last ? monthDiff(monthOfDate(last.due_date), month) : 0
      closing = last ? shiftDate(last.closing_date ?? last.due_date, ahead) : null
      dueDate = last ? shiftDate(last.due_date, ahead) : null
    }

    const closed = closing !== null && closing < today
    const paidOn = closed
      ? (get<{ paid_on: string | null }>(
          this.#db,
          `SELECT MIN(local_date) AS paid_on FROM transactions
            WHERE account_id = :accountId AND removed_at IS NULL AND kind = 'bill_payment' AND direction = 'in'
              AND local_date >= :since AND local_date < :until`,
          { accountId, since: closing, until: shiftDate(closing!, 1) },
        )?.paid_on ?? null)
      : null

    return {
      month,
      amountCents,
      status: paidOn ? 'paid' : closed ? 'closed' : 'open',
      dueDate,
      estimated: record === undefined,
      paidOn,
    }
  }

  /** As faturas de cada mês do ano, divididas por banco. Vale o total da fatura entregue; sem ela, a soma das compras. */
  #billYear(year: string): Dashboard['billYear'] {
    const banks = this.#banks.byItem()
    const bankOfAccount = new Map(
      all<{ id: string; item_id: string }>(this.#db, `SELECT id, item_id FROM accounts WHERE type = 'CREDIT' AND removed_at IS NULL`).map(
        (account) => [account.id, (banks.get(account.item_id) ?? UNKNOWN_BANK).id],
      ),
    )
    // Chave: mês e cartão. As compras entram primeiro; a fatura entregue, quando existe, substitui a soma.
    const amounts = new Map<string, number>()
    for (const row of all<{ account_id: string; month: Month; cents: number }>(
      this.#db,
      `${CARD_ENTRIES}
       SELECT e.account_id, e.bill_month AS month, SUM(${EXPENSE}) AS cents FROM card_entries e
        WHERE substr(e.bill_month, 1, 4) = :year GROUP BY e.account_id, e.bill_month`,
      { year },
    )) {
      amounts.set(`${row.month}|${row.account_id}`, row.cents)
    }
    for (const row of all<{ account_id: string; due_date: string; total_cents: number }>(
      this.#db,
      `SELECT account_id, due_date, total_cents FROM bills
        WHERE currency_code = 'BRL' AND substr(due_date, 1, 4) = :year ORDER BY due_date`,
      { year },
    )) {
      amounts.set(`${monthOfDate(row.due_date)}|${row.account_id}`, row.total_cents)
    }

    return monthsEndingAt(`${year}-12`, 12).map((month) => {
      const byBank = new Map<string, number>()
      for (const [key, cents] of amounts) {
        const [entryMonth, accountId] = key.split('|') as [Month, string]
        const bankId = bankOfAccount.get(accountId)
        if (entryMonth !== month || !bankId) continue
        byBank.set(bankId, (byBank.get(bankId) ?? 0) + cents)
      }
      const byBankShares = shares(byBank)
      return { month, totalCents: byBankShares.reduce((sum, share) => sum + share.cents, 0), byBank: byBankShares }
    })
  }

  /** A fatura unificada de um mês por categoria de primeiro nível, com a parte de cada banco. */
  #billCategories(month: Month): BillCategory[] {
    const banks = this.#banks.byItem()
    const rootOf = this.#categoryRoots()
    const totals = new Map<string | null, { slice: CategorySlice; byBank: Map<string, number> }>()
    for (const row of all<{ item_id: string; category_id: string | null; cents: number }>(
      this.#db,
      `${CARD_ENTRIES}
       SELECT e.item_id, e.effective_category_id AS category_id, SUM(${EXPENSE}) AS cents FROM card_entries e
        WHERE e.bill_month = :month GROUP BY e.item_id, e.effective_category_id`,
      { month },
    )) {
      const root = rootOf(row.category_id)
      const key = root?.id ?? null
      const entry = totals.get(key) ?? { slice: { categoryId: key, name: root?.name ?? UNCATEGORIZED, cents: 0 }, byBank: new Map() }
      const bankId = (banks.get(row.item_id) ?? UNKNOWN_BANK).id
      entry.slice.cents += row.cents
      entry.byBank.set(bankId, (entry.byBank.get(bankId) ?? 0) + row.cents)
      totals.set(key, entry)
    }
    return [...totals.values()]
      .filter(({ slice }) => slice.cents > 0)
      .map(({ slice, byBank }) => ({ ...slice, byBank: shares(byBank) }))
      .sort((a, b) => b.cents - a.cents)
  }

  /** Função que leva uma categoria à de primeiro nível. */
  #categoryRoots() {
    const categories = new Map(
      all<{ id: string; name: string; parent_id: string | null }>(
        this.#db,
        'SELECT id, COALESCE(description_pt, description) AS name, parent_id FROM categories',
      ).map((category) => [category.id, category]),
    )
    return (id: string | null) => {
      let current = id ? categories.get(id) : undefined
      for (let depth = 0; current?.parent_id && depth < 8; depth++) {
        const parent = categories.get(current.parent_id)
        if (!parent) break
        current = parent
      }
      return current
    }
  }

  /**
   * A fatura atual de cada cartão. Vale a última fatura fechada enquanto ela
   * não venceu nem foi paga; depois disso, a fatura em aberto do mês seguinte,
   * somada pelos lançamentos daquela competência.
   *
   * A Pluggy não informa se uma fatura foi paga. Considera-se paga quando o
   * cartão recebeu um pagamento de fatura depois do fechamento dela.
   */
  #bills(): BillSummary[] {
    const today = todayLocal(this.#clock)
    const thisMonth = monthOfDate(today)
    const cards = all<{ id: string; name: string; institution: string; brand: string | null }>(
      this.#db,
      `SELECT a.id, a.name, i.connector_name AS institution, a.brand
         FROM accounts a JOIN pluggy_items i ON i.id = a.item_id
        WHERE a.type = 'CREDIT' AND a.removed_at IS NULL
        ORDER BY a.name`,
    )
    return cards
      .map((card): BillSummary | null => {
        const base = { accountId: card.id, name: card.name, institution: card.institution, brand: card.brand }
        const last = get<{ due_date: string; closing_date: string | null; total_cents: number }>(
          this.#db,
          `SELECT due_date, closing_date, total_cents FROM bills
            WHERE account_id = :id AND currency_code = 'BRL' ORDER BY due_date DESC LIMIT 1`,
          { id: card.id },
        )
        const paid =
          last !== undefined &&
          get(
            this.#db,
            `SELECT 1 AS found FROM transactions
              WHERE account_id = :id AND removed_at IS NULL AND kind = 'bill_payment' AND direction = 'in'
                AND local_date >= :since LIMIT 1`,
            { id: card.id, since: last.closing_date ?? last.due_date },
          ) !== undefined
        if (last && !paid && last.due_date >= today) {
          return {
            ...base,
            month: monthOfDate(last.due_date),
            amountCents: last.total_cents,
            state: 'closed',
            dueDate: last.due_date,
            dueDateEstimated: false,
            previousPaid: false,
          }
        }

        const following = last ? addMonths(monthOfDate(last.due_date), 1) : thisMonth
        const month = following > thisMonth ? following : thisMonth
        const open = get<{ total: number | null; entries: number }>(
          this.#db,
          `SELECT SUM(${EXPENSE}) AS total, COUNT(*) AS entries FROM ledger_entries e
            WHERE e.account_id = :id AND e.competence_month = :month AND e.currency_code = 'BRL'
              AND e.effective_kind <> 'bill_payment'`,
          { id: card.id, month },
        )
        if (!last && !open?.entries) return null
        return {
          ...base,
          month,
          amountCents: open?.total ?? 0,
          state: 'open',
          // O dia de vencimento costuma se repetir; fica marcado como estimativa.
          dueDate: last ? `${month}-${last.due_date.slice(8, 10)}` : null,
          dueDateEstimated: last !== undefined,
          previousPaid: paid,
        }
      })
      .filter((bill) => bill !== null)
      .sort((a, b) => (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))
  }

  /** Entradas e gastos realizados das competências pedidas. */
  #realized(months: Month[]): Map<Month, { incomeCents: number; expenseCents: number }> {
    const params = Object.fromEntries(months.map((month, index) => [`m${index}`, month]))
    return new Map(
      all<{ month: Month; income: number; expense: number }>(
        this.#db,
        `SELECT e.competence_month AS month, SUM(${INCOME}) AS income, SUM(${EXPENSE}) AS expense
           FROM ledger_entries e
          WHERE ${REALIZED} AND e.competence_month IN (${months.map((_, index) => `:m${index}`).join(', ')})
          GROUP BY e.competence_month`,
        params,
      ).map((row) => [row.month, { incomeCents: row.income, expenseCents: row.expense }]),
    )
  }

  #openForecasts(months: Month[]): Map<Month, number> {
    return new Map(
      months.map((month) => [
        month,
        get<{ total: number | null }>(
          this.#db,
          `SELECT SUM(CASE WHEN direction = 'out' THEN -amount_cents ELSE amount_cents END) AS total
             FROM forecast_occurrences WHERE month = :month AND status = 'expected'`,
          { month },
        )?.total ?? 0,
      ]),
    )
  }

  /** Gastos agrupados pela categoria de primeiro nível. */
  #byCategory(month: Month): CategorySlice[] {
    const rootOf = this.#categoryRoots()

    const totals = new Map<string | null, CategorySlice>()
    for (const row of all<{ category_id: string | null; cents: number }>(
      this.#db,
      `SELECT e.effective_category_id AS category_id, SUM(${EXPENSE}) AS cents
         FROM ledger_entries e
        WHERE ${REALIZED} AND e.competence_month = :month
          AND (e.direction = 'out' OR e.account_type = 'CREDIT')
        GROUP BY e.effective_category_id`,
      { month },
    )) {
      const root = rootOf(row.category_id)
      const key = root?.id ?? null
      const slice = totals.get(key) ?? { categoryId: key, name: root?.name ?? UNCATEGORIZED, cents: 0 }
      slice.cents += row.cents
      totals.set(key, slice)
    }
    return [...totals.values()].filter((slice) => slice.cents > 0).sort((a, b) => b.cents - a.cents)
  }

  #byAccount(month: Month): Dashboard['byAccount'] {
    return all<{ account_id: string; name: string; institution: string; in_cents: number; out_cents: number }>(
      this.#db,
      `SELECT e.account_id, e.account_name AS name, e.institution,
              SUM(CASE WHEN e.direction = 'in' THEN e.amount_cents ELSE 0 END) AS in_cents,
              SUM(CASE WHEN e.direction = 'out' THEN e.amount_cents ELSE 0 END) AS out_cents
         FROM ledger_entries e
        WHERE ${REALIZED} AND e.account_type = 'BANK' AND e.competence_month = :month
        GROUP BY e.account_id
        ORDER BY out_cents DESC`,
      { month },
    ).map((row) => ({
      accountId: row.account_id,
      name: row.name,
      institution: row.institution,
      inCents: row.in_cents,
      outCents: row.out_cents,
    }))
  }

  #byCard(month: Month): CardSlice[] {
    return all<{
      account_id: string
      name: string
      institution: string
      brand: string | null
      expense: number
      open_cents: number
      due_date: string | null
    }>(
      this.#db,
      `SELECT e.account_id, e.account_name AS name, e.institution, a.brand,
              SUM(${EXPENSE}) AS expense,
              SUM(CASE WHEN e.status = 'PENDING' THEN ${EXPENSE} ELSE 0 END) AS open_cents,
              (SELECT MAX(b.due_date) FROM bills b
                WHERE b.account_id = e.account_id AND substr(b.due_date, 1, 7) = :month) AS due_date
         FROM ledger_entries e
         JOIN accounts a ON a.id = e.account_id
        WHERE ${REALIZED} AND e.account_type = 'CREDIT' AND e.competence_month = :month
        GROUP BY e.account_id
        ORDER BY expense DESC`,
      { month },
    ).map((row) => ({
      accountId: row.account_id,
      name: row.name,
      institution: row.institution,
      brand: row.brand,
      expenseCents: row.expense,
      openCents: row.open_cents,
      dueDate: row.due_date,
    }))
  }

  /** Lançamentos de conta ainda pendentes: visíveis, mas fora dos totais realizados. */
  #pending(month: Month): Dashboard['pending'] {
    const row = get<{ count: number; in_cents: number | null; out_cents: number | null }>(
      this.#db,
      `SELECT COUNT(*) AS count,
              SUM(CASE WHEN e.direction = 'in' THEN e.amount_cents ELSE 0 END) AS in_cents,
              SUM(CASE WHEN e.direction = 'out' THEN e.amount_cents ELSE 0 END) AS out_cents
         FROM ledger_entries e
        WHERE e.included = 1 AND e.currency_code = 'BRL' AND e.account_type = 'BANK'
          AND e.status = 'PENDING' AND e.competence_month = :month`,
      { month },
    )!
    return { count: row.count, inCents: row.in_cents ?? 0, outCents: row.out_cents ?? 0 }
  }

  /** Compras de cartão sem fatura identificável, nem pelo ciclo do cartão. Não pertencem a nenhum mês. */
  #unidentifiedBill(): Dashboard['unidentifiedBill'] {
    const row = get<{ count: number; cents: number | null }>(
      this.#db,
      `${CARD_ENTRIES}
       SELECT COUNT(*) AS count, SUM(${EXPENSE}) AS cents
         FROM card_entries e
        WHERE e.included = 1 AND e.bill_month IS NULL`,
    )!
    return { count: row.count, cents: row.cents ?? 0 }
  }

  #otherCurrencies(month: Month): Dashboard['otherCurrencies'] {
    return all<{ currency_code: string; count: number; in_cents: number; out_cents: number }>(
      this.#db,
      `SELECT e.currency_code, COUNT(*) AS count,
              SUM(CASE WHEN e.direction = 'in' THEN e.amount_cents ELSE 0 END) AS in_cents,
              SUM(CASE WHEN e.direction = 'out' THEN e.amount_cents ELSE 0 END) AS out_cents
         FROM ledger_entries e
        WHERE e.included = 1 AND e.currency_code <> 'BRL'
          AND COALESCE(e.competence_month, substr(e.local_date, 1, 7)) = :month
        GROUP BY e.currency_code
        ORDER BY e.currency_code`,
      { month },
    ).map((row) => ({
      currencyCode: row.currency_code,
      count: row.count,
      inCents: row.in_cents,
      outCents: row.out_cents,
    }))
  }

  #forecasts(month: Month, thisMonth: Month): Dashboard['forecasts'] {
    const row = get<{ open_count: number | null; open_in: number | null; open_out: number | null; received: number | null }>(
      this.#db,
      `SELECT SUM(CASE WHEN status = 'expected' THEN 1 ELSE 0 END) AS open_count,
              SUM(CASE WHEN status = 'expected' AND direction = 'in' THEN amount_cents ELSE 0 END) AS open_in,
              SUM(CASE WHEN status = 'expected' AND direction = 'out' THEN amount_cents ELSE 0 END) AS open_out,
              SUM(CASE WHEN status IN ('received_auto', 'received_manual')
                THEN CASE WHEN direction = 'out' THEN -amount_cents ELSE amount_cents END
                ELSE 0 END) AS received
         FROM forecast_occurrences WHERE month = :month`,
      { month },
    )
    const overdue = get<{ total: number }>(
      this.#db,
      `SELECT COUNT(*) AS total FROM forecast_occurrences WHERE status = 'expected' AND month < :thisMonth`,
      { thisMonth },
    )
    return {
      openCount: row?.open_count ?? 0,
      openInCents: row?.open_in ?? 0,
      openOutCents: row?.open_out ?? 0,
      overdueCount: overdue?.total ?? 0,
      receivedCents: row?.received ?? 0,
    }
  }
}

/** Junta as faturas dos cartões de um banco. O estado é o que mais pede ação: fechada, depois aberta, depois paga. */
function mergeBills(bills: BankBill[]): BankBill | null {
  if (bills.length <= 1) return bills[0] ?? null
  const urgency = { closed: 0, open: 1, paid: 2 } as const
  const lead = [...bills].sort((a, b) => urgency[a.status] - urgency[b.status] || (a.dueDate ?? '9999').localeCompare(b.dueDate ?? '9999'))[0]!
  return {
    ...lead,
    amountCents: bills.reduce((sum, bill) => sum + bill.amountCents, 0),
    estimated: bills.some((bill) => bill.estimated),
  }
}
