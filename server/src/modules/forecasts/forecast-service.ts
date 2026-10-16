import type {
  ForecastCreateInput,
  ForecastFrequency,
  ForecastOccurrence,
  ForecastScope,
  ForecastSeries,
  OccurrenceManualStatus,
  OccurrenceStatus,
  OccurrenceUpdateInput,
} from '../../../../shared/api.ts'
import { parseForecastExpression, type ForecastMode } from '../../../../shared/forecast-expression.ts'
import { addDays, dayOfMonth, daysBetween, isDay, withDayOfMonth } from '../../../../shared/days.ts'
import { addMonths, monthDiff, monthOfDate, type Month } from '../../../../shared/months.ts'
import { all, get, run, transaction, type Db } from '../../platform/db/database.ts'
import { badRequest, conflict, notFound } from '../../platform/http/errors.ts'
import { currentMonth, todayLocal, type Clock } from '../../platform/time.ts'
import { slotAfter, withinHorizon, type Slot } from './schedule.ts'

interface OccurrenceRow {
  id: number
  series_id: number
  series_name: string | null
  series_size: number
  series_recurring: number
  series_frequency: ForecastFrequency
  sequence: number
  month: Month
  day: string | null
  /** Valor assinado: positivo para entrada, negativo para saída. */
  amount_cents: number
  status: OccurrenceStatus
  match_id: number | null
  tx_id: string | null
  tx_date: string | null
  tx_description: string | null
  tx_account: string | null
  tx_institution: string | null
}

/** Campos de uma ocorrência usados pelas regras de alteração. */
interface OccurrenceCore {
  id: number
  series_id: number
  sequence: number
  month: Month
  day: string | null
  amount_cents: number
  status: OccurrenceStatus
}

interface SeriesCore {
  frequency: ForecastFrequency
  anchor_day: number | null
}

const OCCURRENCE_SELECT = `
  SELECT o.id, o.series_id, s.name AS series_name, s.recurring AS series_recurring,
         s.frequency AS series_frequency, o.sequence, o.month, o.day,
         CASE WHEN o.direction = 'out' THEN -o.amount_cents ELSE o.amount_cents END AS amount_cents,
         o.status,
         (SELECT COUNT(*) FROM forecast_occurrences x WHERE x.series_id = o.series_id) AS series_size,
         m.id AS match_id, t.id AS tx_id, t.local_date AS tx_date, t.description AS tx_description,
         a.name AS tx_account, i.connector_name AS tx_institution
    FROM forecast_occurrences o
    JOIN forecast_series s ON s.id = o.series_id
    LEFT JOIN forecast_matches m ON m.occurrence_id = o.id AND m.status = 'confirmed'
    LEFT JOIN transactions t ON t.id = m.transaction_id
    LEFT JOIN accounts a ON a.id = t.account_id
    LEFT JOIN pluggy_items i ON i.id = a.item_id`

export function toOccurrence(row: OccurrenceRow, today: string): ForecastOccurrence {
  const past = row.day === null ? row.month < monthOfDate(today) : row.day < today
  return {
    id: row.id,
    seriesId: row.series_id,
    seriesName: row.series_name,
    sequence: row.sequence,
    seriesSize: row.series_size,
    recurring: row.series_recurring === 1,
    frequency: row.series_frequency,
    month: row.month,
    day: row.day,
    amountCents: row.amount_cents,
    status: row.status,
    // "Atrasada" não é gravada: é uma prevista cujo dia (ou, sem dia, cuja competência) já passou.
    displayStatus: row.status === 'expected' && past ? 'overdue' : row.status,
    linkedTransaction:
      row.match_id !== null && row.tx_id !== null
        ? {
            matchId: row.match_id,
            id: row.tx_id,
            date: row.tx_date!,
            description: row.tx_description!,
            accountName: row.tx_account ?? '',
            institution: row.tx_institution ?? '',
          }
        : null,
  }
}

export class ForecastService {
  readonly #db: Db
  readonly #clock: Clock

  constructor(db: Db, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  /** Competência inicial padrão de uma nova previsão: o mês seguinte. */
  defaultStartMonth(): Month {
    return addMonths(currentMonth(this.#clock), 1)
  }

  create(input: ForecastCreateInput): ForecastSeries {
    const plan = parseForecastExpression(input.expression)
    const frequency = input.frequency ?? 'monthly'
    const anchorDay = frequency === 'monthly' ? (input.dayOfMonth ?? null) : null
    const first = this.#firstSlot(input, frequency)
    const now = this.#clock().toISOString()

    const seriesId = transaction(this.#db, () => {
      const created = run(
        this.#db,
        `INSERT INTO forecast_series
           (name, expression, mode, total_cents, start_month, recurring, frequency, anchor_day, created_at)
         VALUES (:name, :expression, :mode, :totalCents, :startMonth, :recurring, :frequency, :anchorDay, :now)`,
        {
          name: input.name?.trim() || null,
          expression: input.expression.trim(),
          mode: plan.mode,
          totalCents: plan.totalCents,
          startMonth: first.month,
          recurring: plan.recurring ? 1 : 0,
          frequency,
          anchorDay,
          now,
        },
      )
      const id = Number(created.lastInsertRowid)
      plan.amountsCents.forEach((amountCents, index) => {
        this.#insertOccurrence(id, index + 1, slotAfter(frequency, first, index, anchorDay), amountCents, now)
      })
      return id
    })
    // A recorrente nasce só com a primeira ocorrência; as demais vêm do mesmo caminho que a mantém em dia.
    return this.series(seriesId)
  }

  /** Onde cai a primeira ocorrência, validando o que cada frequência aceita. */
  #firstSlot(input: ForecastCreateInput, frequency: ForecastFrequency): Slot {
    if (frequency === 'monthly') {
      if (input.startDay !== undefined) {
        throw badRequest('Na previsão mensal, informe o mês inicial e, se quiser, o dia do mês.')
      }
      const anchorDay = input.dayOfMonth
      if (anchorDay !== undefined && (!Number.isInteger(anchorDay) || anchorDay < 1 || anchorDay > 31)) {
        throw badRequest('O dia do mês deve ficar entre 1 e 31.')
      }
      const month = input.startMonth ?? this.defaultStartMonth()
      return { month, day: anchorDay === undefined ? null : withDayOfMonth(month, anchorDay) }
    }
    if (!isDay(input.startDay)) throw badRequest('Informe a data da primeira ocorrência.')
    if (input.startMonth !== undefined || input.dayOfMonth !== undefined) {
      throw badRequest('Na previsão semanal ou diária, informe só a data da primeira ocorrência.')
    }
    return { month: monthOfDate(input.startDay), day: input.startDay }
  }

  /**
   * Completa as séries recorrentes até o horizonte de cada frequência. Cada ocorrência
   * nova copia o valor da última, para respeitar alterações feitas em "esta e as próximas".
   */
  extendRecurring() {
    const today = todayLocal(this.#clock)
    const tails = all<OccurrenceCore & SeriesCore>(
      this.#db,
      `SELECT o.id, o.series_id, o.sequence, o.month, o.day, s.frequency, s.anchor_day,
              CASE WHEN o.direction = 'out' THEN -o.amount_cents ELSE o.amount_cents END AS amount_cents,
              o.status
         FROM forecast_occurrences o
         JOIN forecast_series s ON s.id = o.series_id
        WHERE s.recurring = 1
          AND o.sequence = (SELECT MAX(x.sequence) FROM forecast_occurrences x WHERE x.series_id = o.series_id)`,
    )
    const missing = tails.flatMap((tail) => {
      const slots: { tail: OccurrenceCore; step: number; slot: Slot }[] = []
      for (let step = 1; ; step++) {
        const slot = slotAfter(tail.frequency, tail, step, tail.anchor_day)
        if (!withinHorizon(tail.frequency, slot, today)) break
        slots.push({ tail, step, slot })
      }
      return slots
    })
    if (missing.length === 0) return
    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      for (const { tail, step, slot } of missing) {
        this.#insertOccurrence(tail.series_id, tail.sequence + step, slot, tail.amount_cents, now)
      }
    })
  }

  #insertOccurrence(seriesId: number, sequence: number, slot: Slot, amountCents: number, now: string) {
    run(
      this.#db,
      `INSERT INTO forecast_occurrences (series_id, sequence, month, day, amount_cents, direction, status, updated_at)
       VALUES (:seriesId, :sequence, :month, :day, :amountCents, :direction, 'expected', :now)`,
      {
        seriesId,
        sequence,
        month: slot.month,
        day: slot.day,
        amountCents: Math.abs(amountCents),
        direction: amountCents < 0 ? 'out' : 'in',
        now,
      },
    )
  }

  list(): ForecastSeries[] {
    this.extendRecurring()
    const today = todayLocal(this.#clock)
    const occurrences = all<OccurrenceRow>(this.#db, `${OCCURRENCE_SELECT} ORDER BY o.series_id, o.sequence`)
    const bySeries = new Map<number, ForecastOccurrence[]>()
    for (const row of occurrences) {
      const list = bySeries.get(row.series_id)
      const occurrence = toOccurrence(row, today)
      if (list) list.push(occurrence)
      else bySeries.set(row.series_id, [occurrence])
    }
    return all<{
      id: number
      name: string | null
      expression: string
      mode: ForecastMode
      total_cents: number
      recurring: number
      frequency: ForecastFrequency
      anchor_day: number | null
      start_month: Month
      created_at: string
    }>(this.#db, 'SELECT * FROM forecast_series ORDER BY created_at DESC, id DESC').map((row) => ({
      id: row.id,
      name: row.name,
      expression: row.expression,
      mode: row.mode,
      totalCents: row.total_cents,
      recurring: row.recurring === 1,
      frequency: row.frequency,
      dayOfMonth: row.anchor_day,
      startMonth: row.start_month,
      createdAt: row.created_at,
      occurrences: bySeries.get(row.id) ?? [],
    }))
  }

  /** Ocorrências com dia dentro do intervalo, fora as canceladas e ignoradas. É o que o calendário mostra. */
  datedBetween(from: string, to: string): ForecastOccurrence[] {
    this.extendRecurring()
    const today = todayLocal(this.#clock)
    return all<OccurrenceRow>(
      this.#db,
      `${OCCURRENCE_SELECT}
        WHERE o.day BETWEEN :from AND :to AND o.status NOT IN ('cancelled', 'ignored')
        ORDER BY o.day, o.id`,
      { from, to },
    ).map((row) => toOccurrence(row, today))
  }

  series(id: number): ForecastSeries {
    const found = this.list().find((series) => series.id === id)
    if (!found) throw notFound('Previsão não encontrada.')
    return found
  }

  renameSeries(id: number, name: string | null) {
    const result = run(this.#db, 'UPDATE forecast_series SET name = :name WHERE id = :id', {
      id,
      name: name?.trim() || null,
    })
    if (!result.changes) throw notFound('Previsão não encontrada.')
  }

  deleteSeries(id: number) {
    const result = run(this.#db, 'DELETE FROM forecast_series WHERE id = :id', { id })
    if (!result.changes) throw notFound('Previsão não encontrada.')
  }

  /** Altera valor, competência e/ou dia de uma ocorrência, ou dela e de todas as futuras em aberto. */
  updateOccurrence(id: number, input: OccurrenceUpdateInput) {
    const target = this.#occurrence(id)
    if (target.status !== 'expected') {
      throw conflict('occurrence_not_open', 'Só é possível alterar previsões em aberto. Desfaça a baixa antes.')
    }
    const series = get<SeriesCore>(this.#db, 'SELECT frequency, anchor_day FROM forecast_series WHERE id = :id', {
      id: target.series_id,
    })!
    const move = this.#mover(target, series, input)
    const now = this.#clock().toISOString()

    transaction(this.#db, () => {
      for (const occurrence of this.#scoped(target, input.scope)) {
        const slot = move(occurrence)
        run(
          this.#db,
          `UPDATE forecast_occurrences
              SET amount_cents = :amountCents, direction = :direction, month = :month, day = :day, updated_at = :now
            WHERE id = :id`,
          {
            id: occurrence.id,
            amountCents: Math.abs(input.amountCents ?? occurrence.amount_cents),
            direction: (input.amountCents ?? occurrence.amount_cents) < 0 ? 'out' : 'in',
            month: slot.month,
            day: slot.day,
            now,
          },
        )
        // Valor ou data mudaram: as sugestões antigas deixaram de valer.
        run(this.#db, `DELETE FROM forecast_matches WHERE occurrence_id = :id AND status <> 'confirmed'`, {
          id: occurrence.id,
        })
      }
      // As próximas ocorrências de uma mensal recorrente seguem o dia escolhido daqui em diante.
      if (series.frequency === 'monthly' && input.scope === 'future' && input.day !== undefined) {
        run(this.#db, 'UPDATE forecast_series SET anchor_day = :anchorDay WHERE id = :id', {
          id: target.series_id,
          anchorDay: input.day === null ? null : dayOfMonth(input.day),
        })
      }
    })
  }

  /** Como cada ocorrência do alcance se desloca. O dia, quando informado, prevalece sobre a competência. */
  #mover(target: OccurrenceCore, series: SeriesCore, input: OccurrenceUpdateInput): (occurrence: OccurrenceCore) => Slot {
    if (typeof input.day === 'string' && !isDay(input.day)) throw badRequest('Data inválida.')

    if (series.frequency !== 'monthly') {
      if (input.month !== undefined || input.day === null) {
        throw badRequest('Uma previsão semanal ou diária sempre tem dia. Altere a data dela.')
      }
      const delta = input.day === undefined ? 0 : daysBetween(target.day!, input.day)
      return (occurrence) => {
        const day = addDays(occurrence.day!, delta)
        return { month: monthOfDate(day), day }
      }
    }

    const newDay = input.day
    if (typeof newDay === 'string') {
      const shift = monthDiff(target.month, monthOfDate(newDay))
      return (occurrence) => {
        if (occurrence.id === target.id) return { month: monthOfDate(newDay), day: newDay }
        const month = addMonths(occurrence.month, shift)
        return { month, day: withDayOfMonth(month, dayOfMonth(newDay)) }
      }
    }
    const shift = input.month ? monthDiff(target.month, input.month) : 0
    return (occurrence) => {
      const month = addMonths(occurrence.month, shift)
      if (newDay === null || occurrence.day === null) return { month, day: null }
      return { month, day: withDayOfMonth(month, series.anchor_day ?? dayOfMonth(occurrence.day)) }
    }
  }

  /** Cancela uma ocorrência, ou ela e todas as futuras em aberto. Numa recorrente, o segundo caso a encerra. */
  cancelOccurrence(id: number, scope: ForecastScope) {
    const target = this.#occurrence(id)
    if (target.status === 'received_auto' || target.status === 'received_manual') {
      throw conflict('occurrence_received', 'Esta previsão já foi realizada. Desfaça a baixa antes de cancelar.')
    }
    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      for (const occurrence of this.#scoped(target, scope)) this.#setStatus(occurrence.id, 'cancelled', now)
      if (scope === 'future') {
        run(this.#db, 'UPDATE forecast_series SET recurring = 0 WHERE id = :id', { id: target.series_id })
      }
    })
  }

  /** Marcações feitas à mão: realizada sem transação vinculada, ignorada ou de volta a prevista. */
  setManualStatus(id: number, status: OccurrenceManualStatus) {
    const target = this.#occurrence(id)
    const linked = get(
      this.#db,
      `SELECT 1 AS found FROM forecast_matches WHERE occurrence_id = :id AND status = 'confirmed'`,
      { id },
    )
    if (linked) {
      throw conflict('occurrence_linked', 'Esta previsão está vinculada a uma transação. Desfaça o vínculo primeiro.')
    }
    if (target.status === status) return
    this.#setStatus(id, status, this.#clock().toISOString())
  }

  #setStatus(id: number, status: OccurrenceStatus, now: string) {
    run(this.#db, 'UPDATE forecast_occurrences SET status = :status, updated_at = :now WHERE id = :id', {
      id,
      status,
      now,
    })
    if (status !== 'expected') {
      run(this.#db, `DELETE FROM forecast_matches WHERE occurrence_id = :id AND status = 'suggested'`, { id })
    }
  }

  #occurrence(id: number): OccurrenceCore {
    const row = get<OccurrenceCore>(
      this.#db,
      `SELECT id, series_id, sequence, month, day,
              CASE WHEN direction = 'out' THEN -amount_cents ELSE amount_cents END AS amount_cents,
              status
         FROM forecast_occurrences WHERE id = :id`,
      { id },
    )
    if (!row) throw notFound('Ocorrência não encontrada.')
    return row
  }

  /** A própria ocorrência ou, no escopo "futuras", ela e as seguintes que ainda estão em aberto. */
  #scoped(target: OccurrenceCore, scope: ForecastScope): OccurrenceCore[] {
    if (scope === 'one') return [target]
    return all<OccurrenceCore>(
      this.#db,
      `SELECT id, series_id, sequence, month, day,
              CASE WHEN direction = 'out' THEN -amount_cents ELSE amount_cents END AS amount_cents,
              status
         FROM forecast_occurrences
        WHERE series_id = :seriesId AND sequence >= :sequence
          AND (id = :id OR status IN ('expected', 'ignored'))
        ORDER BY sequence`,
      { seriesId: target.series_id, sequence: target.sequence, id: target.id },
    )
  }
}

export { OCCURRENCE_SELECT }
export type { OccurrenceRow }
