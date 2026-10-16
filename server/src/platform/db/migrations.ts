export interface Migration {
  id: number
  name: string
  sql: string
}

/**
 * Migrações aplicadas em ordem e registradas em `schema_migrations`.
 * Nunca edite uma migração já publicada: acrescente outra.
 */
export const migrations: Migration[] = [
  {
    id: 1,
    name: 'schema-inicial',
    sql: `
      -- Somente configurações não secretas. Credenciais ficam no cofre do sistema.
      CREATE TABLE app_settings (
        key        TEXT PRIMARY KEY,
        value      TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE pluggy_items (
        id                  TEXT PRIMARY KEY,
        connector_name      TEXT NOT NULL DEFAULT '',
        connector_image_url TEXT,
        connector_color     TEXT,
        status              TEXT NOT NULL,
        execution_status    TEXT,
        error_code          TEXT,
        error_message       TEXT,
        status_detail       TEXT,
        provider_updated_at TEXT,
        last_synced_at      TEXT,
        last_sync_error     TEXT,
        created_at          TEXT NOT NULL
      );

      CREATE TABLE accounts (
        id                 TEXT PRIMARY KEY,
        item_id            TEXT NOT NULL REFERENCES pluggy_items(id) ON DELETE CASCADE,
        type               TEXT NOT NULL CHECK (type IN ('BANK', 'CREDIT')),
        subtype            TEXT,
        name               TEXT NOT NULL,
        number             TEXT,
        owner_document     TEXT,
        currency_code      TEXT NOT NULL,
        balance_cents      INTEGER NOT NULL DEFAULT 0,
        credit_limit_cents INTEGER,
        brand              TEXT,
        removed_at         TEXT,
        updated_at         TEXT NOT NULL
      );
      CREATE INDEX accounts_item ON accounts(item_id);

      CREATE TABLE bills (
        id            TEXT PRIMARY KEY,
        account_id    TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        due_date      TEXT NOT NULL,
        closing_date  TEXT,
        total_cents   INTEGER NOT NULL,
        currency_code TEXT NOT NULL,
        updated_at    TEXT NOT NULL
      );
      CREATE INDEX bills_account ON bills(account_id, due_date);

      CREATE TABLE categories (
        id             TEXT PRIMARY KEY,
        description    TEXT NOT NULL,
        description_pt TEXT,
        parent_id      TEXT
      );

      CREATE TABLE transactions (
        id                    TEXT PRIMARY KEY,
        account_id            TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        posted_at             TEXT NOT NULL,
        local_date            TEXT NOT NULL,
        description           TEXT NOT NULL,
        merchant_name         TEXT,
        search_text           TEXT NOT NULL,
        amount_cents          INTEGER NOT NULL CHECK (amount_cents >= 0),
        direction             TEXT NOT NULL CHECK (direction IN ('in', 'out')),
        status                TEXT NOT NULL CHECK (status IN ('POSTED', 'PENDING')),
        currency_code         TEXT NOT NULL,
        category_id           TEXT,
        counterparty_document TEXT,
        bill_id               TEXT,
        bill_forecast_month   TEXT,
        installment_number    INTEGER,
        total_installments    INTEGER,
        kind                  TEXT NOT NULL CHECK (kind IN ('regular', 'bill_payment', 'internal_transfer')),
        competence_month      TEXT,
        competence_source     TEXT NOT NULL CHECK (competence_source IN ('date', 'bill', 'forecast', 'none')),
        -- Outra ponta de uma transferência entre contas próprias, quando detectada.
        transfer_pair_id      TEXT,
        last_seen_run         INTEGER NOT NULL,
        removed_at            TEXT
      );
      CREATE INDEX transactions_account_date ON transactions(account_id, local_date);
      CREATE INDEX transactions_competence ON transactions(competence_month);
      CREATE INDEX transactions_date ON transactions(local_date);

      -- Correções feitas pelo usuário; sobrevivem a qualquer sincronização.
      CREATE TABLE transaction_overrides (
        transaction_id    TEXT PRIMARY KEY REFERENCES transactions(id) ON DELETE CASCADE,
        category_id       TEXT,
        include_in_totals INTEGER CHECK (include_in_totals IN (0, 1)),
        updated_at        TEXT NOT NULL
      );

      -- Única definição do que "entra nos totais": regra automática mais a correção local.
      CREATE VIEW ledger_entries AS
      SELECT
        t.*,
        a.type AS account_type,
        a.name AS account_name,
        a.item_id AS item_id,
        i.connector_name AS institution,
        COALESCE(o.category_id, t.category_id) AS effective_category_id,
        CASE WHEN t.transfer_pair_id IS NOT NULL THEN 'internal_transfer' ELSE t.kind END AS effective_kind,
        o.include_in_totals AS include_override,
        CASE
          WHEN o.include_in_totals IS NOT NULL THEN o.include_in_totals
          WHEN t.kind <> 'regular' OR t.transfer_pair_id IS NOT NULL THEN 0
          ELSE 1
        END AS included
      FROM transactions t
      JOIN accounts a ON a.id = t.account_id
      JOIN pluggy_items i ON i.id = a.item_id
      LEFT JOIN transaction_overrides o ON o.transaction_id = t.id
      WHERE t.removed_at IS NULL AND a.removed_at IS NULL;

      CREATE TABLE forecast_series (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT,
        expression  TEXT NOT NULL,
        mode        TEXT NOT NULL CHECK (mode IN ('single', 'repeat', 'split')),
        total_cents INTEGER NOT NULL,
        start_month TEXT NOT NULL,
        created_at  TEXT NOT NULL
      );

      CREATE TABLE forecast_occurrences (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        series_id    INTEGER NOT NULL REFERENCES forecast_series(id) ON DELETE CASCADE,
        sequence     INTEGER NOT NULL,
        month        TEXT NOT NULL,
        amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
        status       TEXT NOT NULL DEFAULT 'expected'
          CHECK (status IN ('expected', 'received_auto', 'received_manual', 'ignored', 'cancelled')),
        updated_at   TEXT NOT NULL,
        UNIQUE (series_id, sequence)
      );
      CREATE INDEX forecast_occurrences_month ON forecast_occurrences(month);

      CREATE TABLE forecast_matches (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        occurrence_id  INTEGER NOT NULL REFERENCES forecast_occurrences(id) ON DELETE CASCADE,
        transaction_id TEXT NOT NULL REFERENCES transactions(id) ON DELETE CASCADE,
        status         TEXT NOT NULL CHECK (status IN ('suggested', 'confirmed', 'rejected')),
        origin         TEXT NOT NULL CHECK (origin IN ('auto', 'manual')),
        reason         TEXT CHECK (reason IN ('ambiguous', 'out_of_month')),
        created_at     TEXT NOT NULL,
        decided_at     TEXT,
        UNIQUE (occurrence_id, transaction_id)
      );
      -- Relacionamento individual: no máximo um vínculo confirmado por lado.
      CREATE UNIQUE INDEX forecast_matches_one_per_occurrence
        ON forecast_matches(occurrence_id) WHERE status = 'confirmed';
      CREATE UNIQUE INDEX forecast_matches_one_per_transaction
        ON forecast_matches(transaction_id) WHERE status = 'confirmed';

      CREATE TABLE sync_runs (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        trigger     TEXT NOT NULL,
        status      TEXT NOT NULL CHECK (status IN ('running', 'success', 'partial', 'failed')),
        started_at  TEXT NOT NULL,
        finished_at TEXT,
        stats       TEXT,
        error       TEXT
      );
    `,
  },
  {
    id: 2,
    name: 'direcao-das-previsoes',
    sql: `
      -- O valor continua absoluto no banco para preservar a restrição original;
      -- a direção dá significado ao sinal e permite conciliar também débitos.
      ALTER TABLE forecast_occurrences ADD COLUMN direction TEXT NOT NULL DEFAULT 'in'
        CHECK (direction IN ('in', 'out'));
    `,
  },
  {
    id: 3,
    name: 'previsoes-recorrentes',
    sql: `
      -- Série sem fim definido: as ocorrências são criadas aos poucos, até um ano à frente.
      ALTER TABLE forecast_series ADD COLUMN recurring INTEGER NOT NULL DEFAULT 0
        CHECK (recurring IN (0, 1));
    `,
  },
  {
    id: 4,
    name: 'previsoes-com-dia-e-frequencia',
    sql: `
      -- A competência continua sendo a base das previsões. O dia é opcional na mensal
      -- e obrigatório na semanal e na diária; quando existe, o mês é sempre o dele.
      ALTER TABLE forecast_series ADD COLUMN frequency TEXT NOT NULL DEFAULT 'monthly'
        CHECK (frequency IN ('monthly', 'weekly', 'daily'));
      -- Dia do mês escolhido para a mensal: sobrevive aos meses curtos (31 volta a ser 31 depois de fevereiro).
      ALTER TABLE forecast_series ADD COLUMN anchor_day INTEGER CHECK (anchor_day BETWEEN 1 AND 31);
      ALTER TABLE forecast_occurrences ADD COLUMN day TEXT;
      CREATE INDEX forecast_occurrences_day ON forecast_occurrences(day);
    `,
  },
  {
    id: 5,
    name: 'assinaturas',
    sql: `
      -- Uma assinatura por estabelecimento. Nasce sugerida pela detecção e só passa a
      -- valer quando o usuário confirma o vínculo; a dispensada fica guardada para não voltar.
      CREATE TABLE subscriptions (
        id               INTEGER PRIMARY KEY AUTOINCREMENT,
        merchant_key     TEXT NOT NULL UNIQUE,
        name             TEXT NOT NULL,
        service_id       TEXT,
        domain           TEXT,
        cadence          TEXT NOT NULL CHECK (cadence IN ('weekly', 'monthly', 'yearly')),
        amount_cents     INTEGER NOT NULL CHECK (amount_cents > 0),
        account_id       TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        last_charge_date TEXT NOT NULL,
        status           TEXT NOT NULL CHECK (status IN ('suggested', 'confirmed', 'dismissed', 'ended')),
        created_at       TEXT NOT NULL,
        decided_at       TEXT,
        updated_at       TEXT NOT NULL
      );

      -- Cobranças vinculadas. A desvinculada à mão continua na tabela, marcada, para não ser anexada de novo.
      CREATE TABLE subscription_charges (
        subscription_id INTEGER NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
        transaction_id  TEXT NOT NULL UNIQUE REFERENCES transactions(id) ON DELETE CASCADE,
        excluded        INTEGER NOT NULL DEFAULT 0 CHECK (excluded IN (0, 1)),
        PRIMARY KEY (subscription_id, transaction_id)
      );
    `,
  },
  {
    id: 6,
    name: 'assinaturas-com-vinculo-manual',
    sql: `
      -- Cobrança que o usuário vinculou à mão. A detecção nunca a desfaz nem a refaz.
      ALTER TABLE subscription_charges ADD COLUMN manual INTEGER NOT NULL DEFAULT 0 CHECK (manual IN (0, 1));
    `,
  },
]
