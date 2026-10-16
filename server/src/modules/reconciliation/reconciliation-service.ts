import type { ForecastFrequency, MatchReason, ReconciliationQueue, ReviewItem } from '../../../../shared/api.ts'
import { all, get, run, transaction, type Db } from '../../platform/db/database.ts'
import { conflict, notFound } from '../../platform/http/errors.ts'
import { todayLocal, type Clock } from '../../platform/time.ts'
import { OCCURRENCE_SELECT, toOccurrence, type OccurrenceRow } from '../forecasts/forecast-service.ts'
import { TOLERANCE_DAYS } from '../forecasts/schedule.ts'
import { pairKey, planMatches, type CreditCandidate, type OpenOccurrence } from './matcher.ts'

interface MatchRow {
  id: number
  occurrence_id: number
  transaction_id: string
  status: 'suggested' | 'confirmed' | 'rejected'
}

export class ReconciliationService {
  readonly #db: Db
  readonly #clock: Clock

  constructor(db: Db, clock: Clock) {
    this.#db = db
    this.#clock = clock
  }

  /**
   * Reavalia previsões em aberto contra os créditos bancários confirmados.
   * Roda depois de cada sincronização e depois de qualquer decisão do usuário.
   */
  reconcile(): { autoMatched: number; suggested: number } {
    const now = this.#clock().toISOString()
    return transaction(this.#db, () => {
      this.#releaseVanished(now)

      const occurrences: OpenOccurrence[] = all<OpenOccurrence & { frequency: ForecastFrequency }>(
        this.#db,
        `SELECT o.id, o.month, o.day, s.frequency,
                CASE WHEN o.direction = 'out' THEN -o.amount_cents ELSE o.amount_cents END AS amountCents
           FROM forecast_occurrences o
           JOIN forecast_series s ON s.id = o.series_id
          WHERE o.status = 'expected'`,
      ).map(({ frequency, ...occurrence }) => ({ ...occurrence, toleranceDays: TOLERANCE_DAYS[frequency] }))
      // Lançamentos em conta, confirmados, em reais e ainda sem vínculo. Débitos recebem
      // sinal negativo para usar o mesmo pareamento exato das entradas.
      const transactions = all<CreditCandidate>(
        this.#db,
        `SELECT e.id, substr(e.local_date, 1, 7) AS month, e.local_date AS date,
                CASE WHEN e.direction = 'out' THEN -e.amount_cents ELSE e.amount_cents END AS amountCents
           FROM ledger_entries e
          WHERE e.account_type = 'BANK' AND e.status = 'POSTED'
            AND e.currency_code = 'BRL' AND e.included = 1
            AND NOT EXISTS (
              SELECT 1 FROM forecast_matches m WHERE m.transaction_id = e.id AND m.status = 'confirmed'
            )`,
      )
      const rejected = new Set(
        all<MatchRow>(
          this.#db,
          `SELECT id, occurrence_id, transaction_id, status FROM forecast_matches WHERE status = 'rejected'`,
        ).map((row) => pairKey(row.occurrence_id, row.transaction_id)),
      )

      const plan = planMatches(occurrences, transactions, rejected)

      run(this.#db, `DELETE FROM forecast_matches WHERE status = 'suggested'`)
      for (const match of plan.auto) {
        run(
          this.#db,
          `INSERT INTO forecast_matches (occurrence_id, transaction_id, status, origin, created_at, decided_at)
           VALUES (:occurrenceId, :transactionId, 'confirmed', 'auto', :now, :now)`,
          { ...match, now },
        )
        run(
          this.#db,
          `UPDATE forecast_occurrences SET status = 'received_auto', updated_at = :now WHERE id = :id`,
          { id: match.occurrenceId, now },
        )
      }
      for (const suggestion of plan.suggestions) {
        run(
          this.#db,
          `INSERT INTO forecast_matches (occurrence_id, transaction_id, status, origin, reason, created_at)
           VALUES (:occurrenceId, :transactionId, 'suggested', 'auto', :reason, :now)`,
          { ...suggestion, now },
        )
      }
      return { autoMatched: plan.auto.length, suggested: plan.suggestions.length }
    })
  }

  /** Um vínculo cuja transação foi excluída na origem devolve a previsão a "prevista". */
  #releaseVanished(now: string) {
    const orphans = all<MatchRow>(
      this.#db,
      `SELECT m.id, m.occurrence_id, m.transaction_id, m.status
         FROM forecast_matches m
        WHERE m.status = 'confirmed'
          AND NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.id = m.transaction_id)`,
    )
    for (const orphan of orphans) {
      run(this.#db, 'DELETE FROM forecast_matches WHERE id = :id', { id: orphan.id })
      run(
        this.#db,
        `UPDATE forecast_occurrences SET status = 'expected', updated_at = :now
          WHERE id = :id AND status IN ('received_auto', 'received_manual')`,
        { id: orphan.occurrence_id, now },
      )
    }
  }

  queue(): ReconciliationQueue {
    const today = todayLocal(this.#clock)
    const candidates = all<{
      match_id: number
      occurrence_id: number
      reason: MatchReason
      tx_id: string
      tx_date: string
      tx_description: string
      tx_account: string
      tx_institution: string
      tx_amount: number
    }>(
      this.#db,
      `SELECT m.id AS match_id, m.occurrence_id, m.reason, e.id AS tx_id, e.local_date AS tx_date,
              e.description AS tx_description, e.account_name AS tx_account,
              e.institution AS tx_institution,
              CASE WHEN e.direction = 'out' THEN -e.amount_cents ELSE e.amount_cents END AS tx_amount
         FROM forecast_matches m
         JOIN ledger_entries e ON e.id = m.transaction_id
        WHERE m.status = 'suggested'
        ORDER BY e.local_date DESC, e.id`,
    )
    if (!candidates.length) return { items: [] }

    const occurrences = new Map(
      all<OccurrenceRow>(
        this.#db,
        `${OCCURRENCE_SELECT}
          WHERE o.id IN (SELECT occurrence_id FROM forecast_matches WHERE status = 'suggested')
          ORDER BY o.month, o.id`,
      ).map((row) => [row.id, toOccurrence(row, today)]),
    )

    const items = new Map<number, ReviewItem>()
    for (const occurrence of occurrences.values()) items.set(occurrence.id, { occurrence, candidates: [] })
    for (const row of candidates) {
      items.get(row.occurrence_id)?.candidates.push({
        matchId: row.match_id,
        reason: row.reason,
        transaction: {
          id: row.tx_id,
          date: row.tx_date,
          description: row.tx_description,
          accountName: row.tx_account,
          institution: row.tx_institution,
          amountCents: row.tx_amount,
        },
      })
    }
    return { items: [...items.values()] }
  }

  reviewCount(): number {
    return (
      get<{ total: number }>(
        this.#db,
        `SELECT COUNT(DISTINCT occurrence_id) AS total FROM forecast_matches WHERE status = 'suggested'`,
      )?.total ?? 0
    )
  }

  /** Confirma uma sugestão: a previsão passa a realizada manualmente. */
  confirm(matchId: number) {
    const match = this.#match(matchId)
    if (match.status !== 'suggested') throw conflict('match_not_pending', 'Esta sugestão já foi decidida.')
    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      // As outras sugestões que disputavam a mesma previsão ou a mesma transação perdem o sentido.
      run(
        this.#db,
        `DELETE FROM forecast_matches
          WHERE status = 'suggested' AND id <> :id
            AND (occurrence_id = :occurrenceId OR transaction_id = :transactionId)`,
        { id: match.id, occurrenceId: match.occurrence_id, transactionId: match.transaction_id },
      )
      run(
        this.#db,
        `UPDATE forecast_matches SET status = 'confirmed', origin = 'manual', decided_at = :now WHERE id = :id`,
        { id: match.id, now },
      )
      run(
        this.#db,
        `UPDATE forecast_occurrences SET status = 'received_manual', updated_at = :now WHERE id = :id`,
        { id: match.occurrence_id, now },
      )
    })
    this.reconcile()
  }

  reject(matchId: number) {
    const match = this.#match(matchId)
    if (match.status !== 'suggested') throw conflict('match_not_pending', 'Esta sugestão já foi decidida.')
    run(this.#db, `UPDATE forecast_matches SET status = 'rejected', decided_at = :now WHERE id = :id`, {
      id: match.id,
      now: this.#clock().toISOString(),
    })
    this.reconcile()
  }

  /**
   * Desfaz um vínculo confirmado (automático ou manual). O par fica registrado
   * como recusado, para que a próxima sincronização não o refaça sozinha.
   */
  undo(matchId: number) {
    const match = this.#match(matchId)
    if (match.status !== 'confirmed') throw conflict('match_not_confirmed', 'Este vínculo não está confirmado.')
    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      run(this.#db, `UPDATE forecast_matches SET status = 'rejected', decided_at = :now WHERE id = :id`, {
        id: match.id,
        now,
      })
      run(this.#db, `UPDATE forecast_occurrences SET status = 'expected', updated_at = :now WHERE id = :id`, {
        id: match.occurrence_id,
        now,
      })
    })
    this.reconcile()
  }

  #match(id: number): MatchRow {
    const row = get<MatchRow>(
      this.#db,
      'SELECT id, occurrence_id, transaction_id, status FROM forecast_matches WHERE id = :id',
      { id },
    )
    if (!row) throw notFound('Vínculo não encontrado.')
    return row
  }
}
