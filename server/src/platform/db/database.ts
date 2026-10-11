import type { DatabaseSync } from 'node:sqlite'
import { migrations } from './migrations.ts'

export type Db = DatabaseSync

export type Row = Record<string, string | number | null>

/** Aplica as migrações pendentes. */
export function migrate(db: Db) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL
  )`)
  const applied = new Set(db.prepare('SELECT id FROM schema_migrations').all().map((row) => row.id))
  for (const migration of migrations) {
    if (applied.has(migration.id)) continue
    transaction(db, () => {
      db.exec(migration.sql)
      db.prepare('INSERT INTO schema_migrations (id, name, applied_at) VALUES (?, ?, ?)').run(
        migration.id,
        migration.name,
        new Date().toISOString(),
      )
    })
  }
}

/** Executa `fn` atomicamente. Chamadas aninhadas participam da transação externa. */
export function transaction<T>(db: Db, fn: () => T): T {
  if (db.isTransaction) return fn()
  db.exec('BEGIN IMMEDIATE')
  try {
    const result = fn()
    db.exec('COMMIT')
    return result
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  }
}

export function all<T = Row>(db: Db, sql: string, params: Record<string, unknown> = {}): T[] {
  return db.prepare(sql).all(bindable(params)) as T[]
}

export function get<T = Row>(db: Db, sql: string, params: Record<string, unknown> = {}): T | undefined {
  return db.prepare(sql).get(bindable(params)) as T | undefined
}

export function run(db: Db, sql: string, params: Record<string, unknown> = {}) {
  return db.prepare(sql).run(bindable(params))
}

/** SQLite não aceita `undefined` nem booleanos: normaliza antes de vincular. */
function bindable(params: Record<string, unknown>) {
  const out: Record<string, string | number | bigint | null> = {}
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) out[key] = null
    else if (typeof value === 'boolean') out[key] = value ? 1 : 0
    else out[key] = value as string | number | bigint
  }
  return out
}
