import { serve } from '@hono/node-server'
import { createApp } from './app.ts'
import { loadConfig, loadEnvFile } from './config.ts'
import { createContainer } from './container.ts'
import { openSecretStore } from './modules/credentials/open-secret-store.ts'
import { MCP_LABELS, VaultMcpTokenStore, mcpVaultService } from './modules/mcp/token-store.ts'
import { openDatabase } from './platform/db/open-database.ts'
import { consoleLogger } from './platform/logger.ts'
import { systemClock } from './platform/time.ts'

loadEnvFile()
const config = loadConfig()
const logger = consoleLogger

const secretStore = await openSecretStore({ service: config.keychainService, dir: config.secretsDir })
const mcpSecretStore = await openSecretStore({
  service: mcpVaultService(config.keychainService),
  dir: config.secretsDir,
  labels: MCP_LABELS,
})

if (secretStore.kind === 'file') {
  logger.warn(
    'Sem cofre do sistema: as credenciais ficam em arquivo local, protegidas só pela permissão do arquivo.',
    { pasta: config.secretsDir },
  )
}

const container = createContainer({
  config,
  db: openDatabase(config.dbPath),
  secretStore,
  mcpTokenStore: new VaultMcpTokenStore(mcpSecretStore),
  clock: systemClock,
  logger,
  env: process.env,
})

serve({ fetch: createApp(container).fetch, hostname: config.host, port: config.port }, (info) => {
  logger.info(`Financeiro rodando em http://localhost:${info.port}`)
})
