import type { AppSettings, ConnectScope } from '../../../../shared/api.ts'
import { get, run, type Db } from '../../platform/db/database.ts'

/** Configurações não secretas. Nenhuma credencial passa por aqui. */
export class SettingsRepo {
  readonly #db: Db

  constructor(db: Db) {
    this.#db = db
  }

  read(key: string): string | null {
    return get<{ value: string }>(this.#db, 'SELECT value FROM app_settings WHERE key = :key', { key })?.value ?? null
  }

  write(key: string, value: string) {
    run(
      this.#db,
      `INSERT INTO app_settings (key, value, updated_at) VALUES (:key, :value, :now)
       ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
      { key, value, now: new Date().toISOString() },
    )
  }

  app(): AppSettings {
    const stored = this.read('connect_scope')
    const connectScope: ConnectScope = stored === 'sandbox' || stored === 'all' ? stored : 'meupluggy'
    return { connectScope, mcpWriteEnabled: this.read('mcp_write_enabled') === '1' }
  }

  updateApp(patch: Partial<AppSettings>): AppSettings {
    if (patch.connectScope !== undefined) this.write('connect_scope', patch.connectScope)
    if (patch.mcpWriteEnabled !== undefined) this.write('mcp_write_enabled', patch.mcpWriteEnabled ? '1' : '0')
    return this.app()
  }
}
