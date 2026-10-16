/**
 * Composição da aplicação: o único lugar que conhece todas as peças.
 * Cada módulo recebe só o que usa, então testes trocam banco, relógio,
 * provedor e cofre sem tocar nas regras.
 */
import type { Config } from './config.ts'
import { CalendarService } from './modules/calendar/calendar-service.ts'
import { ConnectionsService } from './modules/connections/connections-service.ts'
import { CredentialSource } from './modules/credentials/credential-source.ts'
import { CredentialsService } from './modules/credentials/credentials-service.ts'
import type { SecretStore } from './modules/credentials/secret-store.ts'
import { DashboardService } from './modules/dashboard/dashboard-service.ts'
import { BankDirectory } from './modules/institutions/bank-directory.ts'
import { ForecastService } from './modules/forecasts/forecast-service.ts'
import { LedgerQueries } from './modules/ledger/ledger-queries.ts'
import { LedgerWriter } from './modules/ledger/ledger-writer.ts'
import { McpTokenService } from './modules/mcp/mcp-token.ts'
import type { McpTokenStore } from './modules/mcp/token-store.ts'
import { PluggyProvider } from './modules/provider/pluggy/pluggy-provider.ts'
import type { FinancialProvider } from './modules/provider/provider.ts'
import { ReconciliationService } from './modules/reconciliation/reconciliation-service.ts'
import { SubscriptionService } from './modules/subscriptions/subscription-service.ts'
import { SettingsRepo } from './modules/settings/settings-repo.ts'
import { SyncService } from './modules/sync/sync-service.ts'
import type { Db } from './platform/db/database.ts'
import type { Logger } from './platform/logger.ts'
import type { Clock } from './platform/time.ts'

export interface ContainerOptions {
  config: Config
  db: Db
  secretStore: SecretStore
  /** Cofre do token do MCP. */
  mcpTokenStore: McpTokenStore
  clock: Clock
  logger: Logger
  env?: NodeJS.ProcessEnv
  /** Substitui o adaptador da Pluggy (testes ou outro agregador). */
  provider?: FinancialProvider
}

export function createContainer(options: ContainerOptions) {
  const { config, db, clock, logger } = options

  const settings = new SettingsRepo(db)
  const credentialSource = new CredentialSource(options.secretStore, options.env ?? {})
  const provider =
    options.provider ??
    new PluggyProvider({ baseUrl: config.pluggyApiUrl, getCredentials: () => credentialSource.active() })

  const credentials = new CredentialsService({
    source: credentialSource,
    store: options.secretStore,
    provider,
    settings,
    clock,
    logger,
  })

  const writer = new LedgerWriter(db)
  const banks = new BankDirectory(db)
  const ledger = new LedgerQueries(db, banks)
  const forecasts = new ForecastService(db, clock)
  // O painel lê as ocorrências direto do banco: as recorrentes precisam estar em dia desde a partida.
  forecasts.extendRecurring()
  const reconciliation = new ReconciliationService(db, clock)
  const subscriptions = new SubscriptionService(db, clock, banks, ledger)
  const calendar = new CalendarService(db, clock, banks, forecasts, subscriptions)
  const dashboard = new DashboardService(db, clock, banks, () => reconciliation.reviewCount())

  const sync = new SyncService({
    db,
    provider,
    writer,
    reconciliation,
    subscriptions,
    clock,
    logger,
    initialHistoryDays: config.initialHistoryDays,
    lookbackDays: config.lookbackDays,
    openSyncMinIntervalMs: config.openSyncMinIntervalMs,
    onCredentialsRejected: () => credentials.markRejected(),
  })

  const connections = new ConnectionsService({
    db,
    provider,
    writer,
    queries: ledger,
    sync,
    settings,
    clock,
    logger,
  })

  const mcpToken = new McpTokenService(options.mcpTokenStore)

  return {
    config,
    logger,
    clock,
    settings,
    credentials,
    ledger,
    forecasts,
    reconciliation,
    subscriptions,
    calendar,
    dashboard,
    sync,
    connections,
    mcpToken,
  }
}

export type Container = ReturnType<typeof createContainer>
