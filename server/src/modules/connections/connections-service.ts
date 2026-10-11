import type { AccountSummary, Connection, ConnectSession } from '../../../../shared/api.ts'
import { all, get, type Db } from '../../platform/db/database.ts'
import { AppError, notFound } from '../../platform/http/errors.ts'
import type { Logger } from '../../platform/logger.ts'
import type { Clock } from '../../platform/time.ts'
import type { LedgerQueries } from '../ledger/ledger-queries.ts'
import type { LedgerWriter } from '../ledger/ledger-writer.ts'
import { ProviderError, type FinancialProvider } from '../provider/provider.ts'
import type { SettingsRepo } from '../settings/settings-repo.ts'
import type { SyncService } from '../sync/sync-service.ts'
import { connectionHealth } from './health.ts'

interface ItemRow {
  id: string
  connector_name: string
  connector_image_url: string | null
  connector_color: string | null
  status: string
  execution_status: string | null
  status_detail: string | null
  provider_updated_at: string | null
  last_synced_at: string | null
  last_sync_error: string | null
}

interface Deps {
  db: Db
  provider: FinancialProvider
  writer: LedgerWriter
  queries: LedgerQueries
  sync: SyncService
  settings: SettingsRepo
  clock: Clock
  logger: Logger
  /** Intervalo entre consultas enquanto a instituição coleta os dados. */
  pollIntervalMs?: number
  pollTimeoutMs?: number
}

export class ConnectionsService {
  readonly #deps: Deps

  constructor(deps: Deps) {
    this.#deps = deps
  }

  count(): number {
    return get<{ total: number }>(this.#deps.db, 'SELECT COUNT(*) AS total FROM pluggy_items')?.total ?? 0
  }

  list(): Connection[] {
    const accounts = new Map<string, AccountSummary[]>()
    for (const account of this.#deps.queries.listAccounts()) {
      const list = accounts.get(account.itemId)
      if (list) list.push(account)
      else accounts.set(account.itemId, [account])
    }
    return all<ItemRow>(this.#deps.db, 'SELECT * FROM pluggy_items ORDER BY connector_name, created_at').map((row) => {
      const statusDetail = row.status_detail ? (JSON.parse(row.status_detail) as unknown) : null
      return {
        id: row.id,
        institution: { name: row.connector_name, imageUrl: row.connector_image_url, color: row.connector_color },
        status: row.status,
        executionStatus: row.execution_status,
        health: connectionHealth({ status: row.status, executionStatus: row.execution_status, statusDetail }),
        providerUpdatedAt: row.provider_updated_at,
        lastSyncedAt: row.last_synced_at,
        lastSyncError: row.last_sync_error,
        accounts: accounts.get(row.id) ?? [],
      }
    })
  }

  /**
   * Prepara a abertura do widget de conexão.
   *
   * Com `itemId`, o widget atualiza uma conexão existente. Sem ele, o que é
   * oferecido depende da configuração: por padrão só o MeuPluggy, que dá
   * acesso gratuito aos dados do próprio titular. Abrir a lista completa
   * levaria a pessoa a escolher o banco direto, que é um conector pago.
   */
  async connectToken(itemId?: string): Promise<ConnectSession> {
    if (itemId) this.#require(itemId)
    const scope = this.#deps.settings.app().connectScope

    let connectorId: number | null = null
    if (!itemId && scope === 'meupluggy') {
      const connector = await this.#deps.provider.findOwnDataConnector()
      if (!connector) {
        throw new AppError(
          409,
          'meupluggy_not_enabled',
          'O conector MeuPluggy não está habilitado na sua Application. No Pluggy Dashboard, abra a aba Customization, inclua o MeuPluggy na lista de conectores e tente de novo.',
        )
      }
      connectorId = connector.id
    }

    return {
      connectToken: await this.#deps.provider.createConnectToken(itemId),
      includeSandbox: scope === 'sandbox',
      connectorIds: connectorId === null ? null : [connectorId],
      selectedConnectorId: connectorId,
    }
  }

  /** Persiste o `itemId` devolvido pelo widget e busca os dados assim que a coleta terminar. */
  async register(itemId: string) {
    const item = await this.#deps.provider.getItem(itemId)
    this.#deps.writer.upsertItem(item, this.#deps.clock().toISOString())
    this.#settleThenSync(itemId)
  }

  /** Pede uma nova coleta à instituição; os dados chegam em segundo plano. */
  async refresh(itemId: string) {
    this.#require(itemId)
    const item = await this.#deps.provider.refreshItem(itemId)
    this.#deps.writer.upsertItem(item, this.#deps.clock().toISOString())
    this.#settleThenSync(itemId)
  }

  /** Remove a conexão na Pluggy e os dados dela neste Mac. */
  async remove(itemId: string) {
    this.#require(itemId)
    try {
      await this.#deps.provider.deleteItem(itemId)
    } catch (error) {
      // Já não existe na Pluggy: basta limpar a cópia local.
      if (!(error instanceof ProviderError && error.kind === 'not_found')) throw error
    }
    this.#deps.writer.deleteItem(itemId)
  }

  #require(itemId: string) {
    if (!get(this.#deps.db, 'SELECT 1 AS found FROM pluggy_items WHERE id = :itemId', { itemId })) {
      throw notFound('Conexão não encontrada.')
    }
  }

  /**
   * Acompanha o Item até a instituição terminar a coleta e então sincroniza.
   * Roda em segundo plano: a interface acompanha pelo estado da conexão.
   */
  #settleThenSync(itemId: string) {
    const interval = this.#deps.pollIntervalMs ?? 3000
    const deadline = Date.now() + (this.#deps.pollTimeoutMs ?? 3 * 60 * 1000)

    const tick = async () => {
      try {
        const item = await this.#deps.provider.getItem(itemId)
        this.#deps.writer.upsertItem(item, this.#deps.clock().toISOString())
        if (item.status === 'UPDATING' && Date.now() < deadline) {
          setTimeout(tick, interval).unref()
          return
        }
        await this.#deps.sync.run({ trigger: 'connect', itemIds: [itemId] })
      } catch (error) {
        this.#deps.logger.warn('Falha ao acompanhar a atualização da conexão.', {
          itemId,
          reason: error instanceof Error ? error.message : String(error),
        })
      }
    }
    void tick()
  }
}
