/**
 * Sincronização com o provedor.
 *
 * É o único ponto que copia dados externos para o banco local. Hoje é chamada
 * ao abrir o painel e pelo botão "Atualizar agora"; um futuro receptor de
 * webhooks só precisa chamar `run({ itemIds })` com o Item notificado.
 */
import type { SyncItemResult, SyncResponse, SyncRun, SyncState, SyncStatus, SyncTrigger } from '../../../../shared/api.ts'
import { all, get, run, type Db } from '../../platform/db/database.ts'
import type { Logger } from '../../platform/logger.ts'
import { addDays, todayLocal, type Clock } from '../../platform/time.ts'
import type { LedgerWriter } from '../ledger/ledger-writer.ts'
import { ProviderError, type FinancialProvider } from '../provider/provider.ts'
import type { ReconciliationService } from '../reconciliation/reconciliation-service.ts'
import type { SubscriptionService } from '../subscriptions/subscription-service.ts'

interface Deps {
  db: Db
  provider: FinancialProvider
  writer: LedgerWriter
  reconciliation: ReconciliationService
  subscriptions: SubscriptionService
  clock: Clock
  logger: Logger
  initialHistoryDays: number
  lookbackDays: number
  openSyncMinIntervalMs: number
  /** Avisado quando o provedor recusa as credenciais no meio de uma execução. */
  onCredentialsRejected?: () => void
}

interface RunRow {
  id: number
  trigger: SyncTrigger
  status: SyncStatus
  started_at: string
  finished_at: string | null
  stats: string | null
  error: string | null
}

export interface SyncRequest {
  trigger: SyncTrigger
  /** Restringe a execução a estes Items. Sem isto, sincroniza todos. */
  itemIds?: string[]
}

export class SyncService {
  readonly #deps: Deps
  #inFlight: { promise: Promise<SyncRun>; itemIds: string[] | null } | null = null

  constructor(deps: Deps) {
    this.#deps = deps
    // Uma execução que ficou "em andamento" pertence a um processo que já morreu.
    run(
      deps.db,
      `UPDATE sync_runs SET status = 'failed', finished_at = :now, error = 'Interrompida antes de terminar.'
        WHERE status = 'running'`,
      { now: deps.clock().toISOString() },
    )
  }

  state(): SyncState {
    const last = get<RunRow>(this.#deps.db, 'SELECT * FROM sync_runs ORDER BY id DESC LIMIT 1')
    return {
      running: this.#inFlight !== null,
      lastRun: last ? toRun(last) : null,
      lastSuccessAt: this.#lastSuccessAt(),
    }
  }

  /**
   * Executa uma sincronização. Um pedido que chega durante outra execução
   * aproveita o resultado dela quando ela já cobre o que foi pedido; se ela é
   * mais estreita (só uma instituição recém-conectada, por exemplo), espera a
   * vez. A abertura do painel não repete uma sincronização recente.
   */
  async run(request: SyncRequest): Promise<SyncResponse & { run: SyncRun | null }> {
    while (this.#inFlight) {
      const current = this.#inFlight
      const covered =
        current.itemIds === null || (request.itemIds?.every((id) => current.itemIds!.includes(id)) ?? false)
      const finished = await current.promise
      if (covered) return { skipped: false, run: finished }
    }

    if (request.trigger === 'open') {
      const last = this.#lastSuccessAt()
      if (last && this.#deps.clock().getTime() - Date.parse(last) < this.#deps.openSyncMinIntervalMs) {
        return { skipped: true, run: this.state().lastRun }
      }
    }

    const promise = this.#execute(request).finally(() => {
      this.#inFlight = null
    })
    this.#inFlight = { promise, itemIds: request.itemIds ?? null }
    return { skipped: false, run: await promise }
  }

  #lastSuccessAt(): string | null {
    return (
      get<{ finished_at: string }>(
        this.#deps.db,
        `SELECT finished_at FROM sync_runs WHERE status IN ('success', 'partial') ORDER BY id DESC LIMIT 1`,
      )?.finished_at ?? null
    )
  }

  async #execute(request: SyncRequest): Promise<SyncRun> {
    const { db, provider, writer, clock, logger } = this.#deps
    const runId = Number(
      run(db, `INSERT INTO sync_runs (trigger, status, started_at) VALUES (:trigger, 'running', :now)`, {
        trigger: request.trigger,
        now: clock().toISOString(),
      }).lastInsertRowid,
    )

    const items: SyncItemResult[] = []
    let reconciliation = { autoMatched: 0, suggested: 0 }
    let fatal: string | null = null

    try {
      const known = all<{ id: string; connector_name: string }>(db, 'SELECT id, connector_name FROM pluggy_items')
      const targets = request.itemIds ? known.filter((item) => request.itemIds!.includes(item.id)) : known

      if (targets.length) writer.upsertCategories(await provider.listCategories())
      for (const target of targets) {
        items.push(await this.#syncItem(target.id, target.connector_name, runId))
      }

      writer.repairTransfers()
      reconciliation = this.#deps.reconciliation.reconcile()
      this.#deps.subscriptions.detect()
    } catch (error) {
      fatal = describe(error)
      if (error instanceof ProviderError && error.kind === 'invalid_credentials') this.#deps.onCredentialsRejected?.()
      logger.error('Sincronização interrompida.', { runId, reason: fatal })
    }

    const failures = items.filter((item) => !item.ok).length
    const status: SyncStatus =
      fatal || (items.length > 0 && failures === items.length)
        ? 'failed'
        : failures > 0 || items.some((item) => item.partial)
          ? 'partial'
          : 'success'

    run(
      db,
      `UPDATE sync_runs SET status = :status, finished_at = :now, stats = :stats, error = :error WHERE id = :runId`,
      { runId, status, now: clock().toISOString(), stats: JSON.stringify({ items, reconciliation }), error: fatal },
    )
    logger.info('Sincronização concluída.', { runId, status, items: items.length })
    return toRun(get<RunRow>(db, 'SELECT * FROM sync_runs WHERE id = :runId', { runId })!)
  }

  /** Falhas em uma instituição não impedem as outras: o resultado fica registrado por Item. */
  async #syncItem(itemId: string, institution: string, runId: number): Promise<SyncItemResult> {
    const { provider, writer, clock } = this.#deps
    const result: SyncItemResult = {
      itemId,
      institution,
      ok: true,
      partial: false,
      error: null,
      accounts: 0,
      transactionsUpserted: 0,
      transactionsRemoved: 0,
    }

    try {
      const item = await provider.getItem(itemId)
      writer.upsertItem(item, clock().toISOString())
      result.institution = item.institution.name
      // Ainda coletando ou coleta parcial: grava o que houver, mas sinaliza.
      result.partial = item.status === 'UPDATING' || item.executionStatus === 'PARTIAL_SUCCESS'

      const accounts = await provider.listAccounts(itemId)
      writer.upsertAccounts(itemId, accounts, clock().toISOString())
      result.accounts = accounts.length

      const today = todayLocal(clock)
      for (const account of accounts) {
        if (account.type === 'CREDIT') {
          writer.replaceBills(account.id, await provider.listBills(account.id), clock().toISOString())
        }

        const windowDays = writer.hasTransactions(account.id) ? this.#deps.lookbackDays : this.#deps.initialHistoryDays
        const dateFrom = addDays(today, -windowDays)
        for await (const page of provider.listTransactions(account, { dateFrom })) {
          result.transactionsUpserted += writer.upsertTransactions(account, page, runId)
        }
        // Só chega aqui se todas as páginas vieram: então quem não voltou foi excluído.
        // Com a coleta ainda em andamento ou parcial, a ausência não prova exclusão.
        // Um dia de margem evita apagar o que está na borda da janela por diferença de fuso.
        if (!result.partial) {
          result.transactionsRemoved += writer.markMissingAsRemoved(account.id, {
            runId,
            fromLocalDate: addDays(dateFrom, 1),
            now: clock().toISOString(),
          })
        }
      }
      writer.recordItemSync(itemId, { syncedAt: clock().toISOString(), error: null })
    } catch (error) {
      // Credenciais recusadas afetam todas as instituições: interrompe a execução inteira.
      if (error instanceof ProviderError && (error.kind === 'invalid_credentials' || error.kind === 'missing_credentials')) {
        throw error
      }
      result.ok = false
      result.error = describe(error)
      writer.recordItemSync(itemId, { error: result.error })
    }
    return result
  }
}

function describe(error: unknown): string {
  if (error instanceof ProviderError) return error.message
  return error instanceof Error ? `Erro inesperado: ${error.message}` : 'Erro inesperado.'
}

function toRun(row: RunRow): SyncRun {
  const stats = row.stats ? (JSON.parse(row.stats) as Pick<SyncRun, 'items' | 'reconciliation'>) : null
  return {
    id: row.id,
    trigger: row.trigger,
    status: row.status,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    items: stats?.items ?? [],
    reconciliation: stats?.reconciliation ?? { autoMatched: 0, suggested: 0 },
    error: row.error,
  }
}
