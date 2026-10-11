/** Lado de escrita do livro-razão local: tudo que a sincronização grava. */
import { all, get, run, transaction, type Db } from '../../platform/db/database.ts'
import { localDateOf } from '../../platform/time.ts'
import type {
  ProviderAccount,
  ProviderBill,
  ProviderCategory,
  ProviderItem,
  ProviderTransaction,
} from '../provider/provider.ts'
import {
  competenceOf,
  directionOf,
  kindOf,
  pairInternalTransfers,
  searchText,
  type BillRef,
  type TransferCandidate,
} from './derive.ts'

export class LedgerWriter {
  readonly #db: Db

  constructor(db: Db) {
    this.#db = db
  }

  upsertItem(item: ProviderItem, now: string) {
    run(
      this.#db,
      `INSERT INTO pluggy_items (
         id, connector_name, connector_image_url, connector_color, status, execution_status,
         error_code, error_message, status_detail, provider_updated_at, created_at
       ) VALUES (
         :id, :name, :imageUrl, :color, :status, :executionStatus,
         :errorCode, :errorMessage, :statusDetail, :updatedAt, :now
       )
       ON CONFLICT (id) DO UPDATE SET
         connector_name = excluded.connector_name,
         connector_image_url = excluded.connector_image_url,
         connector_color = excluded.connector_color,
         status = excluded.status,
         execution_status = excluded.execution_status,
         error_code = excluded.error_code,
         error_message = excluded.error_message,
         status_detail = excluded.status_detail,
         provider_updated_at = excluded.provider_updated_at`,
      {
        id: item.id,
        name: item.institution.name,
        imageUrl: item.institution.imageUrl,
        color: item.institution.color,
        status: item.status,
        executionStatus: item.executionStatus,
        errorCode: item.error?.code,
        errorMessage: item.error?.message,
        statusDetail: item.statusDetail == null ? null : JSON.stringify(item.statusDetail),
        updatedAt: item.updatedAt,
        now,
      },
    )
  }

  recordItemSync(itemId: string, result: { syncedAt?: string; error: string | null }) {
    run(
      this.#db,
      `UPDATE pluggy_items
          SET last_synced_at = COALESCE(:syncedAt, last_synced_at), last_sync_error = :error
        WHERE id = :itemId`,
      { itemId, syncedAt: result.syncedAt, error: result.error },
    )
  }

  /** Grava as contas do item e marca como removidas as que o provedor deixou de listar. */
  upsertAccounts(itemId: string, accounts: ProviderAccount[], now: string) {
    transaction(this.#db, () => {
      for (const account of accounts) {
        run(
          this.#db,
          `INSERT INTO accounts (
             id, item_id, type, subtype, name, number, owner_document, currency_code,
             balance_cents, credit_limit_cents, brand, removed_at, updated_at
           ) VALUES (
             :id, :itemId, :type, :subtype, :name, :number, :ownerDocument, :currencyCode,
             :balanceCents, :creditLimitCents, :brand, NULL, :now
           )
           ON CONFLICT (id) DO UPDATE SET
             item_id = excluded.item_id, type = excluded.type, subtype = excluded.subtype,
             name = excluded.name, number = excluded.number, owner_document = excluded.owner_document,
             currency_code = excluded.currency_code, balance_cents = excluded.balance_cents,
             credit_limit_cents = excluded.credit_limit_cents, brand = excluded.brand,
             removed_at = NULL, updated_at = excluded.updated_at`,
          { ...account, now },
        )
      }
      const kept = new Set(accounts.map((account) => account.id))
      for (const row of all<{ id: string }>(
        this.#db,
        'SELECT id FROM accounts WHERE item_id = :itemId AND removed_at IS NULL',
        { itemId },
      )) {
        if (!kept.has(row.id)) {
          run(this.#db, 'UPDATE accounts SET removed_at = :now WHERE id = :id', { id: row.id, now })
        }
      }
    })
  }

  /** Substitui as faturas da conta pelas que o provedor informa agora. */
  replaceBills(accountId: string, bills: ProviderBill[], now: string) {
    transaction(this.#db, () => {
      run(this.#db, 'DELETE FROM bills WHERE account_id = :accountId', { accountId })
      for (const bill of bills) {
        run(
          this.#db,
          `INSERT INTO bills (id, account_id, due_date, closing_date, total_cents, currency_code, updated_at)
           VALUES (:id, :accountId, :dueDate, :closingDate, :totalCents, :currencyCode, :now)`,
          { ...bill, now },
        )
      }
    })
  }

  upsertCategories(categories: ProviderCategory[]) {
    transaction(this.#db, () => {
      for (const category of categories) {
        run(
          this.#db,
          `INSERT INTO categories (id, description, description_pt, parent_id)
           VALUES (:id, :description, :descriptionPt, :parentId)
           ON CONFLICT (id) DO UPDATE SET
             description = excluded.description,
             description_pt = excluded.description_pt,
             parent_id = excluded.parent_id`,
          { ...category },
        )
      }
    })
  }

  hasTransactions(accountId: string): boolean {
    return get(this.#db, 'SELECT 1 AS found FROM transactions WHERE account_id = :accountId LIMIT 1', { accountId }) !== undefined
  }

  /**
   * Grava uma página de transações pelo identificador do provedor.
   * Repetir a mesma página não cria linhas novas: só atualiza as existentes.
   */
  upsertTransactions(account: ProviderAccount, transactions: ProviderTransaction[], runId: number): number {
    const bills: BillRef[] = all<{ id: string; due_date: string; closing_date: string | null }>(
      this.#db,
      'SELECT id, due_date, closing_date FROM bills WHERE account_id = :accountId',
      { accountId: account.id },
    ).map((bill) => ({ id: bill.id, dueDate: bill.due_date, closingDate: bill.closing_date }))
    const categoryDescriptions = new Map(
      all<{ id: string; description: string }>(this.#db, 'SELECT id, description FROM categories').map((c) => [
        c.id,
        c.description,
      ]),
    )

    transaction(this.#db, () => {
      for (const tx of transactions) {
        const localDate = localDateOf(tx.postedAt)
        const direction = directionOf(tx.type)
        const competence = competenceOf(
          { accountType: account.type, localDate, billId: tx.billId, billForecastMonth: tx.billForecastMonth },
          bills,
        )
        const kind = kindOf({
          accountType: account.type,
          direction,
          description: tx.description,
          category: { id: tx.categoryId, description: tx.categoryId ? (categoryDescriptions.get(tx.categoryId) ?? null) : null },
          counterpartyDocument: tx.counterpartyDocument,
          ownerDocument: account.ownerDocument,
        })
        run(
          this.#db,
          `INSERT INTO transactions (
             id, account_id, posted_at, local_date, description, merchant_name, search_text,
             amount_cents, direction, status, currency_code, category_id, counterparty_document,
             bill_id, bill_forecast_month, installment_number, total_installments,
             kind, competence_month, competence_source, last_seen_run, removed_at
           ) VALUES (
             :id, :accountId, :postedAt, :localDate, :description, :merchantName, :searchText,
             :amountCents, :direction, :status, :currencyCode, :categoryId, :counterpartyDocument,
             :billId, :billForecastMonth, :installmentNumber, :totalInstallments,
             :kind, :competenceMonth, :competenceSource, :runId, NULL
           )
           ON CONFLICT (id) DO UPDATE SET
             account_id = excluded.account_id, posted_at = excluded.posted_at,
             local_date = excluded.local_date, description = excluded.description,
             merchant_name = excluded.merchant_name, search_text = excluded.search_text,
             amount_cents = excluded.amount_cents, direction = excluded.direction,
             status = excluded.status, currency_code = excluded.currency_code,
             category_id = excluded.category_id, counterparty_document = excluded.counterparty_document,
             bill_id = excluded.bill_id, bill_forecast_month = excluded.bill_forecast_month,
             installment_number = excluded.installment_number,
             total_installments = excluded.total_installments, kind = excluded.kind,
             competence_month = excluded.competence_month,
             competence_source = excluded.competence_source,
             last_seen_run = excluded.last_seen_run, removed_at = NULL`,
          {
            id: tx.id,
            accountId: account.id,
            postedAt: tx.postedAt,
            localDate,
            description: tx.description,
            merchantName: tx.merchantName,
            searchText: searchText(tx.description, tx.merchantName),
            amountCents: tx.amountCents,
            direction,
            status: tx.status,
            currencyCode: tx.currencyCode,
            categoryId: tx.categoryId,
            counterpartyDocument: tx.counterpartyDocument,
            billId: tx.billId,
            billForecastMonth: tx.billForecastMonth,
            installmentNumber: tx.installmentNumber,
            totalInstallments: tx.totalInstallments,
            kind,
            competenceMonth: competence.month,
            competenceSource: competence.source,
            runId,
          },
        )
      }
    })
    return transactions.length
  }

  /**
   * Exclusões: o que existia na janela consultada e não voltou nesta execução
   * foi apagado na origem. A linha é mantida e marcada, porque o provedor
   * avisa que uma transação excluída pode reaparecer em outra coleta.
   */
  markMissingAsRemoved(accountId: string, options: { runId: number; fromLocalDate: string; now: string }): number {
    const result = run(
      this.#db,
      `UPDATE transactions SET removed_at = :now
        WHERE account_id = :accountId AND removed_at IS NULL
          AND last_seen_run <> :runId AND local_date >= :fromLocalDate`,
      { accountId, ...options },
    )
    return Number(result.changes)
  }

  /** Refaz do zero o pareamento de transferências entre contas próprias. */
  repairTransfers() {
    const rows = all<{
      id: string
      account_id: string
      direction: 'in' | 'out'
      amount_cents: number
      local_date: string
      category_id: string | null
      counterparty_document: string | null
      owner_document: string | null
    }>(
      this.#db,
      `SELECT t.id, t.account_id, t.direction, t.amount_cents, t.local_date, t.category_id,
              t.counterparty_document, a.owner_document
         FROM transactions t
         JOIN accounts a ON a.id = t.account_id
        WHERE t.removed_at IS NULL AND a.removed_at IS NULL AND a.type = 'BANK'
          AND t.kind = 'regular' AND t.status = 'POSTED' AND t.currency_code = 'BRL'`,
    )
    const candidates: TransferCandidate[] = rows.map((row) => ({
      id: row.id,
      accountId: row.account_id,
      direction: row.direction,
      amountCents: row.amount_cents,
      localDate: row.local_date,
      categoryId: row.category_id,
      foreignCounterparty:
        row.counterparty_document !== null &&
        row.owner_document !== null &&
        row.counterparty_document !== row.owner_document,
    }))
    const pairs = pairInternalTransfers(candidates)

    transaction(this.#db, () => {
      run(this.#db, 'UPDATE transactions SET transfer_pair_id = NULL WHERE transfer_pair_id IS NOT NULL')
      for (const [id, pairId] of pairs) {
        run(this.#db, 'UPDATE transactions SET transfer_pair_id = :pairId WHERE id = :id', { id, pairId })
      }
    })
  }

  deleteItem(itemId: string) {
    run(this.#db, 'DELETE FROM pluggy_items WHERE id = :itemId', { itemId })
  }
}
