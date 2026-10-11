import type {
  ForecastCreateInput,
  ForecastOccurrence,
  ForecastScope,
  ForecastSeries,
  OccurrenceManualStatus,
  OccurrenceStatus,
  OccurrenceUpdateInput,
} from '../../../../shared/api.ts'
import { parseForecastExpression, type ForecastMode } from '../../../../shared/forecast-expression.ts'
import { addMonths, monthDiff, type Month } from '../../../../shared/months.ts'
import { all, get, run, transaction, type Db } from '../../platform/db/database.ts'
import { conflict, notFound } from '../../platform/http/errors.ts'
import { currentMonth, type Clock } from '../../platform/time.ts'

interface OccurrenceRow {
  id: number
  series_id: number
  series_name: string | null
  series_size: number
  series_recurring: number
  sequence: number
  month: Month
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
  amount_cents: number
  status: OccurrenceStatus
}

const OCCURRENCE_SELECT = `
  SELECT o.id, o.series_id, s.name AS series_name, s.recurring AS series_recurring, o.sequence, o.month,
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

export function toOccurrence(row: OccurrenceRow, thisMonth: Month): ForecastOccurrence {
  return {
    id: row.id,
    seriesId: row.series_id,
    seriesName: row.series_name,
    sequence: row.sequence,
    seriesSize: row.series_size,
    recurring: row.series_recurring === 1,
    month: row.month,
    amountCents: row.amount_cents,
    status: row.status,
    // "Atrasada" não é gravada: é uma prevista cuja competência já passou.
    displayStatus: row.status === 'expected' && row.month < thisMonth ? 'overdue' : row.status,
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

/** Até quantos meses à frente do atual uma recorrente mantém ocorrências criadas. */
const RECURRING_HORIZON_MONTHS = 12

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
    const startMonth = input.startMonth ?? this.defaultStartMonth()
    const now = this.#clock().toISOString()

    const seriesId = transaction(this.#db, () => {
      const created = run(
        this.#db,
        `INSERT INTO forecast_series (name, expression, mode, total_cents, start_month, recurring, created_at)
         VALUES (:name, :expression, :mode, :totalCents, :startMonth, :recurring, :now)`,
        {
          name: input.name?.trim() || null,
          expression: input.expression.trim(),
          mode: plan.mode,
          totalCents: plan.totalCents,
          startMonth,
          recurring: plan.recurring ? 1 : 0,
          now,
        },
      )
      const id = Number(created.lastInsertRowid)
      plan.amountsCents.forEach((amountCents, index) => {
        this.#insertOccurrence(id, index + 1, addMonths(startMonth, index), amountCents, now)
      })
      return id
    })
    // A recorrente nasce só com o primeiro mês; os demais vêm do mesmo caminho que a mantém em dia.
    return this.series(seriesId)
  }

  /**
   * Completa as séries recorrentes até o horizonte. Cada mês novo copia o valor
   * da última ocorrência, para respeitar alterações feitas em "esta e as próximas".
   */
  extendRecurring() {
    const horizon = addMonths(currentMonth(this.#clock), RECURRING_HORIZON_MONTHS)
    const tails = all<OccurrenceCore>(
      this.#db,
      `SELECT o.id, o.series_id, o.sequence, o.month,
              CASE WHEN o.direction = 'out' THEN -o.amount_cents ELSE o.amount_cents END AS amount_cents,
              o.status
         FROM forecast_occurrences o
         JOIN forecast_series s ON s.id = o.series_id
        WHERE s.recurring = 1 AND o.month < :horizon
          AND o.sequence = (SELECT MAX(x.sequence) FROM forecast_occurrences x WHERE x.series_id = o.series_id)`,
      { horizon },
    )
    if (tails.length === 0) return
    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      for (const tail of tails) {
        const missing = monthDiff(tail.month, horizon)
        for (let step = 1; step <= missing; step++) {
          this.#insertOccurrence(tail.series_id, tail.sequence + step, addMonths(tail.month, step), tail.amount_cents, now)
        }
      }
    })
  }

  #insertOccurrence(seriesId: number, sequence: number, month: Month, amountCents: number, now: string) {
    run(
      this.#db,
      `INSERT INTO forecast_occurrences (series_id, sequence, month, amount_cents, direction, status, updated_at)
       VALUES (:seriesId, :sequence, :month, :amountCents, :direction, 'expected', :now)`,
      { seriesId, sequence, month, amountCents: Math.abs(amountCents), direction: amountCents < 0 ? 'out' : 'in', now },
    )
  }

  list(): ForecastSeries[] {
    this.extendRecurring()
    const thisMonth = currentMonth(this.#clock)
    const occurrences = all<OccurrenceRow>(this.#db, `${OCCURRENCE_SELECT} ORDER BY o.series_id, o.sequence`)
    const bySeries = new Map<number, ForecastOccurrence[]>()
    for (const row of occurrences) {
      const list = bySeries.get(row.series_id)
      const occurrence = toOccurrence(row, thisMonth)
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
      start_month: Month
      created_at: string
    }>(this.#db, 'SELECT * FROM forecast_series ORDER BY created_at DESC, id DESC').map((row) => ({
      id: row.id,
      name: row.name,
      expression: row.expression,
      mode: row.mode,
      totalCents: row.total_cents,
      recurring: row.recurring === 1,
      startMonth: row.start_month,
      createdAt: row.created_at,
      occurrences: bySeries.get(row.id) ?? [],
    }))
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

  /** Altera valor e/ou competência de uma ocorrência, ou dela e de todas as futuras em aberto. */
  updateOccurrence(id: number, input: OccurrenceUpdateInput) {
    const target = this.#occurrence(id)
    if (target.status !== 'expected') {
      throw conflict('occurrence_not_open', 'Só é possível alterar previsões em aberto. Desfaça a baixa antes.')
    }
    const now = this.#clock().toISOString()
    const shift = input.month ? monthDiff(target.month, input.month) : 0

    transaction(this.#db, () => {
      for (const occurrence of this.#scoped(target, input.scope)) {
        run(
          this.#db,
          `UPDATE forecast_occurrences
              SET amount_cents = :amountCents, direction = :direction, month = :month, updated_at = :now
            WHERE id = :id`,
          {
            id: occurrence.id,
            amountCents: Math.abs(input.amountCents ?? occurrence.amount_cents),
            direction: (input.amountCents ?? occurrence.amount_cents) < 0 ? 'out' : 'in',
            month: addMonths(occurrence.month, shift),
            now,
          },
        )
        // Valor ou mês mudaram: as sugestões antigas deixaram de valer.
        run(this.#db, `DELETE FROM forecast_matches WHERE occurrence_id = :id AND status <> 'confirmed'`, {
          id: occurrence.id,
        })
      }
    })
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
      `SELECT id, series_id, sequence, month,
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
      `SELECT id, series_id, sequence, month,
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
