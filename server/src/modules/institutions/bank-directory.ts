/** De qual banco é cada conexão. Lê os nomes guardados e aplica o catálogo de `shared/banks.ts`. */
import { identifyBank, type BankRef } from '../../../../shared/banks.ts'
import { all, type Db } from '../../platform/db/database.ts'

export class BankDirectory {
  readonly #db: Db

  constructor(db: Db) {
    this.#db = db
  }

  /** Banco de cada conexão, pelo id dela. */
  byItem(): Map<string, BankRef> {
    const items = new Map<string, { connector: string; accounts: string[] }>()
    for (const row of all<{ id: string; connector_name: string; account_name: string | null }>(
      this.#db,
      `SELECT i.id, i.connector_name, a.name AS account_name
         FROM pluggy_items i LEFT JOIN accounts a ON a.item_id = i.id`,
    )) {
      const item = items.get(row.id) ?? { connector: row.connector_name, accounts: [] }
      if (row.account_name) item.accounts.push(row.account_name)
      items.set(row.id, item)
    }
    return new Map([...items].map(([id, item]) => [id, identifyBank(item.connector, item.accounts)]))
  }

  /** Conexões que pertencem a um banco. */
  itemsOf(bankId: string): string[] {
    return [...this.byItem()].filter(([, bank]) => bank.id === bankId).map(([itemId]) => itemId)
  }
}
