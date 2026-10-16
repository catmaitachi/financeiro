import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { AppError } from '../src/platform/http/errors.ts'
import { CARD, ITEM, seeded, setup, tx } from './support.ts'

describe('abertura do widget de conexão', () => {
  it('por padrão abre direto no MeuPluggy, sem oferecer os conectores pagos', async () => {
    const { container } = setup()
    assert.deepEqual(await container.connections.connectToken(), {
      connectToken: 'connect-token-temporario',
      includeSandbox: false,
      connectorIds: [200],
      selectedConnectorId: 200,
    })
  })

  it('MeuPluggy desabilitado na Application: explica onde habilitar, sem gastar um Connect Token', async () => {
    const { container, provider } = setup()
    provider.ownDataConnector = null

    await assert.rejects(
      container.connections.connectToken(),
      (error) => error instanceof AppError && error.code === 'meupluggy_not_enabled' && /Customization/.test(error.message),
    )
    assert.equal(provider.calls.connectTokens, 0)
  })

  it('Sandbox e lista completa não restringem os conectores', async () => {
    const { container } = setup()

    container.settings.updateApp({ connectScope: 'sandbox' })
    assert.deepEqual(await container.connections.connectToken(), {
      connectToken: 'connect-token-temporario',
      includeSandbox: true,
      connectorIds: null,
      selectedConnectorId: null,
    })

    container.settings.updateApp({ connectScope: 'all' })
    const session = await container.connections.connectToken()
    assert.deepEqual([session.includeSandbox, session.connectorIds], [false, null])
  })

  it('atualizar uma conexão existente não depende do conector escolhido', async () => {
    const { container, provider } = seeded()
    provider.ownDataConnector = null
    const session = await container.connections.connectToken(ITEM)
    assert.deepEqual([session.connectorIds, session.selectedConnectorId], [null, null])
  })
})

describe('atualizar uma conexão', () => {
  it('pede nova coleta à instituição e sincroniza quando ela termina', async () => {
    const { container, provider } = seeded()
    assert.deepEqual(await container.connections.refresh(ITEM), { requested: true })
    assert.equal(provider.calls.refreshes, 1)
  })

  it('no MeuPluggy, que não aceita o pedido, copia de novo o que ele já tem', async () => {
    const { container, provider } = seeded()
    provider.items.get(ITEM)!.institution.name = 'MeuPluggy'
    provider.transactions = [tx({ postedAt: '2026-10-07T12:00:00.000Z', amountCents: 4200 })]

    assert.deepEqual(await container.connections.refresh(ITEM), { requested: false })
    assert.equal(provider.calls.refreshes, 0)
    assert.equal(container.ledger.listTransactions({}).items.length, 1)
    assert.ok(container.connections.list()[0]?.lastSyncedAt)
  })
})

describe('previsão de fatura instável', () => {
  it('compra posterior ao fechamento não volta para a fatura fechada, mesmo que a previsão diga isso', async () => {
    const { provider, container } = seeded()
    provider.bills = [
      { id: 'fatura-set', accountId: CARD, dueDate: '2026-09-14', closingDate: '2026-09-07', totalCents: 0, currencyCode: 'BRL' },
    ]
    const purchase = tx({ accountId: CARD, postedAt: '2026-09-18T12:00:00.000Z', amountCents: 12000, status: 'PENDING', billForecastMonth: '2026-10' })
    provider.transactions = [purchase]
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.dashboard.build('2026-10').totals.expenseCents, 12000)

    // Em uma sincronização seguinte, a previsão passa a apontar para setembro, que já fechou.
    provider.transactions = [{ ...purchase, billForecastMonth: '2026-09' }]
    await container.sync.run({ trigger: 'manual' })

    assert.equal(container.dashboard.build('2026-09').totals.expenseCents, 0)
    // Sem competência gravada, a compra ainda aparece na fatura de outubro do banco: foi feita
    // depois do fechamento de setembro, então o ciclo do cartão a coloca na fatura seguinte.
    const october = container.dashboard.build('2026-10')
    assert.deepEqual(october.unidentifiedBill, { count: 0, cents: 0 })
    assert.equal(october.billYear.find((entry) => entry.month === '2026-10')?.totalCents, 12000)
    assert.equal(october.billCategories.reduce((sum, category) => sum + category.cents, 0), 12000)

    // Quando a previsão se corrige, o lançamento volta para outubro.
    provider.transactions = [purchase]
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.dashboard.build('2026-10').totals.expenseCents, 12000)
  })
})
