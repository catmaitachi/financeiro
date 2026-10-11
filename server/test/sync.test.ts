import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ProviderError } from '../src/modules/provider/provider.ts'
import { bankAccount, CARD, cardAccount, CHECKING, ITEM, seeded, tx, uuid } from './support.ts'

const count = (db: ReturnType<typeof seeded>['db'], sql: string) =>
  (db.prepare(sql).get() as { total: number }).total

describe('sincronização', () => {
  it('percorre todas as páginas de transações', async () => {
    const { provider, container, db } = seeded()
    provider.pageSize = 10
    provider.transactions = Array.from({ length: 35 }, (_, i) =>
      tx({ postedAt: `2026-09-${String((i % 28) + 1).padStart(2, '0')}T12:00:00.000Z`, amountCents: 1000 + i }),
    )

    const { run } = await container.sync.run({ trigger: 'manual' })

    assert.equal(provider.calls.transactionPages, 4)
    assert.equal(run?.status, 'success')
    assert.equal(run?.items[0]?.transactionsUpserted, 35)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions'), 35)
  })

  it('repetir a sincronização não duplica registros', async () => {
    const { provider, container, db } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 5000 }),
      tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 7500, accountId: CARD, billForecastMonth: '2026-11' }),
    ]

    await container.sync.run({ trigger: 'manual' })
    await container.sync.run({ trigger: 'manual' })
    await container.sync.run({ trigger: 'manual' })

    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions'), 2)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM accounts'), 2)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM pluggy_items'), 1)
    assert.equal(count(db, `SELECT COUNT(*) AS total FROM sync_runs WHERE status = 'success'`), 3)
  })

  it('aplica atualizações vindas do provedor na mesma linha', async () => {
    const { provider, container, db } = seeded()
    const pending = tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 4200, status: 'PENDING', description: 'PIX agendado' })
    provider.transactions = [pending]
    await container.sync.run({ trigger: 'manual' })

    provider.transactions = [{ ...pending, status: 'POSTED', amountCents: 4250, description: 'PIX enviado' }]
    await container.sync.run({ trigger: 'manual' })

    const row = db.prepare('SELECT status, amount_cents, description FROM transactions WHERE id = ?').get(pending.id)
    assert.deepEqual({ ...row }, { status: 'POSTED', amount_cents: 4250, description: 'PIX enviado' })
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions'), 1)
  })

  it('marca como removido o que foi excluído na origem e restaura se reaparecer', async () => {
    const { provider, container, db } = seeded()
    const kept = tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 })
    const deleted = tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 2000 })
    provider.transactions = [kept, deleted]
    await container.sync.run({ trigger: 'manual' })

    provider.transactions = [kept]
    const { run } = await container.sync.run({ trigger: 'manual' })
    assert.equal(run?.items[0]?.transactionsRemoved, 1)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions WHERE removed_at IS NOT NULL'), 1)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 1)

    provider.transactions = [kept, deleted]
    await container.sync.run({ trigger: 'manual' })
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 2)
  })

  it('não trata como excluído o que está fora da janela consultada', async () => {
    const { provider, container, db, setNow } = seeded()
    const old = tx({ postedAt: '2026-03-10T12:00:00.000Z', amountCents: 9900 })
    provider.transactions = [old, tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 })]
    await container.sync.run({ trigger: 'manual' })

    // Sincronizações seguintes só reavaliam os últimos 90 dias.
    setNow('2026-10-09T15:00:00.000Z')
    await container.sync.run({ trigger: 'manual' })

    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions WHERE removed_at IS NOT NULL'), 0)
  })

  it('falha em uma conta não derruba a execução: resultado parcial e nada é apagado', async () => {
    const { provider, container, db } = seeded()
    const other = 'aaaaaaaa-0000-4000-8000-000000000002'
    const otherAccount = 'bbbbbbbb-0000-4000-8000-000000000009'
    provider.addItem({ id: other, institution: { name: 'Outro Banco', imageUrl: null, color: null } })
    provider.accounts.push(bankAccount({ id: otherAccount, itemId: other, name: 'Conta 2' }))
    db.prepare(`INSERT INTO pluggy_items (id, connector_name, status, created_at) VALUES (?, 'Outro Banco', 'UPDATED', ?)`).run(
      other,
      '2026-10-01T00:00:00.000Z',
    )
    provider.transactions = [
      tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 }),
      tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 2000, accountId: otherAccount }),
    ]
    await container.sync.run({ trigger: 'manual' })

    provider.failTransactionsFor = otherAccount
    const { run } = await container.sync.run({ trigger: 'manual' })

    assert.equal(run?.status, 'partial')
    assert.deepEqual(
      run?.items.map((item) => [item.institution, item.ok]),
      [
        ['Banco Exemplo', true],
        ['Outro Banco', false],
      ],
    )
    assert.match(run?.items[1]?.error ?? '', /indisponível/)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 2)
    assert.equal(container.connections.list().find((c) => c.id === other)?.lastSyncError, run?.items[1]?.error)
  })

  it('Item ainda atualizando: grava o que há, sinaliza parcial e não infere exclusões', async () => {
    const { provider, container, db } = seeded()
    const existing = tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 })
    provider.transactions = [existing]
    await container.sync.run({ trigger: 'manual' })

    provider.addItem({ status: 'UPDATING', executionStatus: 'TRANSACTIONS_IN_PROGRESS' })
    provider.transactions = []
    const { run } = await container.sync.run({ trigger: 'manual' })

    assert.equal(run?.status, 'partial')
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 1)
    assert.equal(container.connections.list()[0]?.health.level, 'updating')
  })

  it('abrir o painel não repete uma sincronização recente; o botão sempre executa', async () => {
    const { container, setNow } = seeded()
    assert.equal((await container.sync.run({ trigger: 'open' })).skipped, false)

    setNow('2026-10-08T15:05:00.000Z')
    assert.equal((await container.sync.run({ trigger: 'open' })).skipped, true)
    assert.equal((await container.sync.run({ trigger: 'manual' })).skipped, false)

    setNow('2026-10-08T15:30:00.000Z')
    assert.equal((await container.sync.run({ trigger: 'open' })).skipped, false)
  })

  it('pedidos simultâneos compartilham a mesma execução', async () => {
    const { container, db } = seeded()
    const [first, second] = await Promise.all([
      container.sync.run({ trigger: 'manual' }),
      container.sync.run({ trigger: 'manual' }),
    ])
    assert.equal(first.run?.id, second.run?.id)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM sync_runs'), 1)
  })

  it('um pedido completo não se contenta com uma execução restrita a outra instituição', async () => {
    const { provider, container, db } = seeded()
    const other = 'aaaaaaaa-0000-4000-8000-000000000002'
    provider.addItem({ id: other, institution: { name: 'Outro Banco', imageUrl: null, color: null } })
    provider.accounts.push(bankAccount({ id: 'bbbbbbbb-0000-4000-8000-000000000009', itemId: other, name: 'Conta 2' }))
    db.prepare(`INSERT INTO pluggy_items (id, connector_name, status, created_at) VALUES (?, 'Outro Banco', 'UPDATED', ?)`).run(
      other,
      '2026-10-01T00:00:00.000Z',
    )
    provider.transactions = [
      tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 }),
      tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 2000, accountId: 'bbbbbbbb-0000-4000-8000-000000000009' }),
    ]

    const [narrow, full] = await Promise.all([
      container.sync.run({ trigger: 'connect', itemIds: [other] }),
      container.sync.run({ trigger: 'manual' }),
    ])

    assert.equal(narrow.run?.items.length, 1)
    assert.equal(full.run?.items.length, 2)
    assert.notEqual(narrow.run?.id, full.run?.id)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 2)
  })

  it('credenciais recusadas interrompem a execução e marcam o estado como inválido', async () => {
    const { provider, container, secretStore } = seeded()
    await secretStore.write({ clientId: '11111111-2222-4333-8444-555555555555', clientSecret: 'segredo-de-teste-0001' })
    assert.equal((await container.credentials.status()).state, 'valid')

    provider.failWith = new ProviderError('invalid_credentials', 'A Pluggy recusou as credenciais.', 401)
    const { run } = await container.sync.run({ trigger: 'manual' })

    assert.equal(run?.status, 'failed')
    assert.equal((await container.credentials.status()).state, 'invalid')
  })

  it('uma conta que deixa de existir no provedor some das consultas, sem apagar o histórico', async () => {
    const { provider, container, db } = seeded()
    provider.transactions = [tx({ postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000, accountId: CARD, billForecastMonth: '2026-11' })]
    await container.sync.run({ trigger: 'manual' })

    provider.accounts = [bankAccount()]
    await container.sync.run({ trigger: 'manual' })

    assert.deepEqual(container.ledger.listAccounts().map((a) => a.id), [CHECKING])
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions'), 1)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 0)

    provider.accounts = [bankAccount(), cardAccount()]
    await container.sync.run({ trigger: 'manual' })
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM ledger_entries'), 1)
  })

  it('remover a conexão apaga os dados dela e só dela', async () => {
    const { provider, container, db } = seeded()
    provider.transactions = [tx({ id: uuid(), postedAt: '2026-10-01T12:00:00.000Z', amountCents: 1000 })]
    await container.sync.run({ trigger: 'manual' })
    container.forecasts.create({ expression: '300*2' })

    await container.connections.remove(ITEM)

    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM transactions'), 0)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM accounts'), 0)
    assert.equal(count(db, 'SELECT COUNT(*) AS total FROM forecast_occurrences'), 2)
    assert.equal(provider.items.size, 0)
  })
})
