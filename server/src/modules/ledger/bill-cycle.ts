/**
 * O ciclo de uma fatura de cartão: quando fecha, quando vence, quanto soma e
 * em que estado está. É a mesma leitura para o painel e para o calendário.
 */
import type { BankBill } from '../../../../shared/api.ts'
import { shiftMonths } from '../../../../shared/days.ts'
import { monthDiff, monthOfDate, type Month } from '../../../../shared/months.ts'
import { get, type Db } from '../../platform/db/database.ts'
import { BILL_MONTH } from './bill-month.ts'

export interface CardBill extends BankBill {
  /** Dia do fechamento. Nulo quando o banco nunca informou um para este cartão. */
  closingDate: string | null
}

interface BillRow {
  due_date: string
  closing_date: string | null
  total_cents: number
}

/**
 * A fatura de um cartão com vencimento no mês pedido.
 *
 * Se o banco já a entregou, valem o total e as datas dela. Se não, o valor é
 * a soma das compras daquele ciclo e as datas repetem o ciclo da última
 * fatura conhecida. A Pluggy não informa se uma fatura foi paga: considera-se
 * paga quando o cartão recebeu um pagamento depois do fechamento dela.
 */
export function cardBill(db: Db, accountId: string, month: Month, today: string): CardBill | null {
  const record = get<BillRow>(
    db,
    `SELECT due_date, closing_date, total_cents FROM bills
      WHERE account_id = :accountId AND currency_code = 'BRL' AND substr(due_date, 1, 7) = :month
      ORDER BY due_date DESC LIMIT 1`,
    { accountId, month },
  )
  const last = get<BillRow>(
    db,
    `SELECT due_date, closing_date, total_cents FROM bills
      WHERE account_id = :accountId AND currency_code = 'BRL' ORDER BY due_date DESC LIMIT 1`,
    { accountId },
  )

  let amountCents: number
  let closingDate: string | null
  let dueDate: string | null
  if (record) {
    amountCents = record.total_cents
    closingDate = record.closing_date
    dueDate = record.due_date
  } else {
    if (last && month < monthOfDate(last.due_date)) return null
    // Gasto líquido do ciclo: compras menos estornos.
    const open = get<{ total: number | null; entries: number }>(
      db,
      `WITH card_entries AS (
         SELECT e.*, ${BILL_MONTH} AS bill_month
           FROM ledger_entries e
          WHERE e.account_type = 'CREDIT' AND e.currency_code = 'BRL' AND e.effective_kind <> 'bill_payment'
       )
       SELECT SUM(CASE WHEN e.direction = 'out' THEN e.amount_cents ELSE -e.amount_cents END) AS total,
              COUNT(*) AS entries
         FROM card_entries e
        WHERE e.account_id = :accountId AND e.bill_month = :month`,
      { accountId, month },
    )
    if (!last && !open?.entries) return null
    amountCents = open?.total ?? 0
    const ahead = last ? monthDiff(monthOfDate(last.due_date), month) : 0
    closingDate = last?.closing_date ? shiftMonths(last.closing_date, ahead) : null
    dueDate = last ? shiftMonths(last.due_date, ahead) : null
  }

  // Sem dia de fechamento conhecido, a fatura só conta como fechada no vencimento.
  const closing = closingDate ?? dueDate
  const closed = closing !== null && closing < today
  const paidOn = closed
    ? (get<{ paid_on: string | null }>(
        db,
        `SELECT MIN(local_date) AS paid_on FROM transactions
          WHERE account_id = :accountId AND removed_at IS NULL AND kind = 'bill_payment' AND direction = 'in'
            AND local_date >= :since AND local_date < :until`,
        { accountId, since: closing, until: shiftMonths(closing!, 1) },
      )?.paid_on ?? null)
    : null

  return {
    month,
    amountCents,
    status: paidOn ? 'paid' : closed ? 'closed' : 'open',
    dueDate,
    closingDate,
    estimated: record === undefined,
    paidOn,
  }
}
