import type {
  BillClosingEvent,
  BillDueEvent,
  BillStatus,
  CalendarEvent,
  CalendarRange,
} from '../../../../shared/api.ts'
import type { BankRef } from '../../../../shared/banks.ts'
import { daysBetween } from '../../../../shared/days.ts'
import { addMonths, monthDiff, monthOfDate } from '../../../../shared/months.ts'
import { all, type Db } from '../../platform/db/database.ts'
import { badRequest } from '../../platform/http/errors.ts'
import { todayLocal, type Clock } from '../../platform/time.ts'
import type { ForecastService } from '../forecasts/forecast-service.ts'
import type { BankDirectory } from '../institutions/bank-directory.ts'
import { cardBill } from '../ledger/bill-cycle.ts'
import type { SubscriptionService } from '../subscriptions/subscription-service.ts'

/** Maior intervalo atendido de uma vez: um trimestre. */
const MAX_RANGE_DAYS = 92
const UNKNOWN_BANK: BankRef = { id: 'outro', name: 'Outro banco' }

/** Na mesma data, primeiro o que é do banco, depois o que é do usuário. */
const ORDER: Record<CalendarEvent['kind'], number> = { bill_closing: 0, bill_due: 1, subscription: 2, forecast: 3 }
/** Ao somar cartões do mesmo banco, vale o estado mais urgente. */
const URGENCY: Record<BillStatus, number> = { closed: 0, open: 1, paid: 2 }

type BillEvent = BillClosingEvent | BillDueEvent

/**
 * O que acontece em cada dia: fechamento e vencimento de faturas, cobranças de
 * assinaturas e previsões com dia. Só lê; cada regra continua no módulo dono.
 */
export class CalendarService {
  readonly #db: Db
  readonly #clock: Clock
  readonly #banks: BankDirectory
  readonly #forecasts: ForecastService
  readonly #subscriptions: SubscriptionService

  constructor(db: Db, clock: Clock, banks: BankDirectory, forecasts: ForecastService, subscriptions: SubscriptionService) {
    this.#db = db
    this.#clock = clock
    this.#banks = banks
    this.#forecasts = forecasts
    this.#subscriptions = subscriptions
  }

  events(from: string, to: string): CalendarRange {
    if (to < from) throw badRequest('O fim do intervalo vem antes do início.')
    if (daysBetween(from, to) > MAX_RANGE_DAYS) throw badRequest(`O intervalo pode ter até ${MAX_RANGE_DAYS} dias.`)
    const today = todayLocal(this.#clock)

    const events: CalendarEvent[] = [
      ...this.#bills(from, to, today),
      ...this.#subscriptions.charged(from, to).map(({ subscription, charge }) => ({
        kind: 'subscription' as const,
        date: charge.date,
        subscriptionId: subscription.id,
        name: subscription.name,
        domain: subscription.domain,
        amountCents: charge.amountCents,
        charged: true,
        bank: subscription.bank,
      })),
      ...this.#subscriptions.upcoming(from, to).map(({ subscription, date }) => ({
        kind: 'subscription' as const,
        date,
        subscriptionId: subscription.id,
        name: subscription.name,
        domain: subscription.domain,
        amountCents: subscription.amountCents,
        charged: false,
        bank: subscription.bank,
      })),
      ...this.#forecasts.datedBetween(from, to).map((occurrence) => ({
        kind: 'forecast' as const,
        date: occurrence.day!,
        occurrenceId: occurrence.id,
        name: occurrence.seriesName,
        amountCents: occurrence.amountCents,
        status: occurrence.displayStatus,
      })),
    ]
    events.sort((a, b) => a.date.localeCompare(b.date) || ORDER[a.kind] - ORDER[b.kind])
    return { from, to, today, events }
  }

  /** Fechamentos e vencimentos no intervalo. Cartões do mesmo banco na mesma data viram um evento só. */
  #bills(from: string, to: string, today: string): BillEvent[] {
    const banks = this.#banks.byItem()
    const merged = new Map<string, BillEvent>()
    const add = (event: BillEvent) => {
      if (event.date < from || event.date > to) return
      const key = `${event.kind}:${event.bank.id}:${event.date}`
      const existing = merged.get(key)
      if (!existing) return void merged.set(key, event)
      existing.amountCents += event.amountCents
      existing.estimated ||= event.estimated
      if (existing.kind === 'bill_due' && event.kind === 'bill_due' && URGENCY[event.status] < URGENCY[existing.status]) {
        existing.status = event.status
      }
    }

    // O fechamento de uma fatura costuma cair no mês anterior ao do vencimento: olha um mês além do intervalo.
    const first = monthOfDate(from)
    const months = Array.from({ length: monthDiff(first, monthOfDate(to)) + 2 }, (_, index) => addMonths(first, index))
    for (const account of all<{ id: string; item_id: string }>(
      this.#db,
      `SELECT id, item_id FROM accounts WHERE type = 'CREDIT' AND removed_at IS NULL`,
    )) {
      const bank = banks.get(account.item_id) ?? UNKNOWN_BANK
      for (const month of months) {
        const bill = cardBill(this.#db, account.id, month, today)
        if (!bill) continue
        const { amountCents, estimated } = bill
        if (bill.closingDate) add({ kind: 'bill_closing', date: bill.closingDate, bank, amountCents, estimated })
        if (bill.dueDate) add({ kind: 'bill_due', date: bill.dueDate, bank, amountCents, status: bill.status, estimated })
      }
    }
    return [...merged.values()]
  }
}
