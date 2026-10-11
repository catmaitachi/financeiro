import initSqlJs, { type BindParams, type Database } from 'sql.js'
import wasmUrl from 'sql.js/dist/sql-wasm-browser.wasm?url'
import type { Db } from '../../../server/src/platform/db/database.ts'

type Row = Record<string, unknown>

/** `:nome` é como o servidor escreve os parâmetros; o `node:sqlite` aceita a chave sem os dois-pontos, o sql.js não. */
function bindings(args: unknown[]): BindParams {
  const [first] = args
  if (args.length === 1 && first !== null && typeof first === 'object' && !Array.isArray(first)) {
    return Object.fromEntries(Object.entries(first).map(([key, value]) => [`:${key}`, value])) as BindParams
  }
  return args as BindParams
}

/**
 * SQLite em WebAssembly, só na memória da aba, com a mesma cara do
 * `DatabaseSync` do Node na parte que o servidor usa (`exec`, `prepare` com
 * `all`/`get`/`run`, `isTransaction`). É o que deixa as regras de verdade
 * rodarem na demo sem uma segunda implementação.
 */
export async function openBrowserDatabase(): Promise<Db> {
  const SQL = await initSqlJs({ locateFile: () => wasmUrl })
  const db: Database = new SQL.Database()
  let inTransaction = false

  const rows = (sql: string, args: unknown[], limit: number): Row[] => {
    const statement = db.prepare(sql)
    try {
      statement.bind(bindings(args))
      const found: Row[] = []
      while (found.length < limit && statement.step()) found.push(statement.getAsObject())
      return found
    } finally {
      statement.free()
    }
  }

  const adapter = {
    get isTransaction() {
      return inTransaction
    },
    exec(sql: string) {
      db.exec(sql)
      if (/^\s*BEGIN\b/i.test(sql)) inTransaction = true
      else if (/^\s*(COMMIT|ROLLBACK)\b/i.test(sql)) inTransaction = false
    },
    prepare: (sql: string) => ({
      all: (...args: unknown[]) => rows(sql, args, Infinity),
      get: (...args: unknown[]) => rows(sql, args, 1)[0],
      run: (...args: unknown[]) => {
        db.run(sql, bindings(args))
        const changes = db.getRowsModified()
        const lastInsertRowid = Number(db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] ?? 0)
        return { changes, lastInsertRowid }
      },
    }),
  }
  adapter.exec('PRAGMA foreign_keys = ON')
  return adapter as unknown as Db
}
