import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { seeded, tx } from './support.ts'

const income = (overrides: Partial<Parameters<typeof tx>[0]> = {}) =>
  tx({ postedAt: '2026-10-05T12:00:00.000Z', amountCents: 30000, type: 'CREDIT', description: 'PIX recebido', ...overrides })

type Context = ReturnType<typeof seeded>
const occurrences = (context: Context) => context.container.forecasts.list().flatMap((series) => series.occurrences)

describe('conciliação de previsões', () => {
  it('vínculo único: baixa automática depois da sincronização', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', name: 'Aluguel da sala', startMonth: '2026-10' })
    const received = income()
    context.provider.transactions = [received]

    const { run } = await context.container.sync.run({ trigger: 'manual' })

    assert.deepEqual(run?.reconciliation, { autoMatched: 1, suggested: 0 })
    const [occurrence] = occurrences(context)
    assert.equal(occurrence?.status, 'received_auto')
    assert.equal(occurrence?.linkedTransaction?.id, received.id)
    assert.equal(context.container.ledger.listTransactions({}).items[0]?.linkedForecast?.label, 'Aluguel da sala')
  })

  it('uma saída prevista é conciliada com um débito, sem disputar com entradas', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '-300', name: 'Aluguel', startMonth: '2026-10' })
    const paid = income({ type: 'DEBIT', description: 'Aluguel pago' })
    context.provider.transactions = [paid, income()]

    const { run } = await context.container.sync.run({ trigger: 'manual' })

    assert.deepEqual(run?.reconciliation, { autoMatched: 1, suggested: 0 })
    const [occurrence] = occurrences(context)
    assert.equal(occurrence?.amountCents, -30000)
    assert.equal(occurrence?.status, 'received_auto')
    assert.equal(occurrence?.linkedTransaction?.id, paid.id)
    assert.equal(context.container.dashboard.build('2026-10').forecasts.receivedCents, -30000)
  })

  it('ambiguidade: duas movimentações iguais vão para revisão e nada é baixado sozinho', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.provider.transactions = [income(), income({ postedAt: '2026-10-07T12:00:00.000Z' })]

    await context.container.sync.run({ trigger: 'manual' })

    assert.equal(occurrences(context)[0]?.status, 'expected')
    const queue = context.container.reconciliation.queue()
    assert.equal(queue.items.length, 1)
    assert.deepEqual(queue.items[0]?.candidates.map((c) => c.reason), ['ambiguous', 'ambiguous'])
    assert.equal(context.container.dashboard.build('2026-10').reviewCount, 1)
  })

  it('mês incorreto: recebimento fora da competência só é sugerido', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-09' })
    context.provider.transactions = [income()]

    await context.container.sync.run({ trigger: 'manual' })

    assert.equal(occurrences(context)[0]?.displayStatus, 'overdue')
    assert.equal(context.container.reconciliation.queue().items[0]?.candidates[0]?.reason, 'out_of_month')
  })

  it('transação pendente não liquida previsão; só depois de confirmada', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    const pending = income({ status: 'PENDING' })
    context.provider.transactions = [pending]
    await context.container.sync.run({ trigger: 'manual' })

    assert.equal(occurrences(context)[0]?.status, 'expected')
    assert.equal(context.container.reconciliation.queue().items.length, 0)

    context.provider.transactions = [{ ...pending, status: 'POSTED' }]
    await context.container.sync.run({ trigger: 'manual' })
    assert.equal(occurrences(context)[0]?.status, 'received_auto')
  })

  it('só considera crédito em conta: débito e lançamento de cartão ficam de fora', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.provider.transactions = [
      income({ type: 'DEBIT' }),
      income({ accountId: 'cccccccc-0000-4000-8000-000000000001', description: 'Estorno', billForecastMonth: '2026-10' }),
    ]
    await context.container.sync.run({ trigger: 'manual' })

    assert.equal(occurrences(context)[0]?.status, 'expected')
    assert.equal(context.container.reconciliation.queue().items.length, 0)
  })

  it('confirmar uma sugestão vincula e descarta as concorrentes', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    const first = income()
    const second = income({ postedAt: '2026-10-07T12:00:00.000Z' })
    context.provider.transactions = [first, second]
    await context.container.sync.run({ trigger: 'manual' })

    const candidate = context.container.reconciliation
      .queue()
      .items[0]!.candidates.find((c) => c.transaction.id === second.id)!
    context.container.reconciliation.confirm(candidate.matchId)

    const [occurrence] = occurrences(context)
    assert.equal(occurrence?.status, 'received_manual')
    assert.equal(occurrence?.linkedTransaction?.id, second.id)
    assert.equal(context.container.reconciliation.queue().items.length, 0)
  })

  it('rejeitar remove o candidato da fila e ele não volta na próxima sincronização', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-09' })
    context.provider.transactions = [income()]
    await context.container.sync.run({ trigger: 'manual' })

    context.container.reconciliation.reject(context.container.reconciliation.queue().items[0]!.candidates[0]!.matchId)
    assert.equal(context.container.reconciliation.queue().items.length, 0)

    await context.container.sync.run({ trigger: 'manual' })
    assert.equal(context.container.reconciliation.queue().items.length, 0)
    assert.equal(occurrences(context)[0]?.status, 'expected')
  })

  it('desfazer devolve a previsão a "prevista" e a sincronização seguinte não refaz o vínculo', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.provider.transactions = [income()]
    await context.container.sync.run({ trigger: 'manual' })
    const linked = occurrences(context)[0]!
    assert.equal(linked.status, 'received_auto')

    context.container.reconciliation.undo(linked.linkedTransaction!.matchId)
    assert.equal(occurrences(context)[0]?.status, 'expected')
    assert.equal(occurrences(context)[0]?.linkedTransaction, null)

    await context.container.sync.run({ trigger: 'manual' })
    assert.equal(occurrences(context)[0]?.status, 'expected')
  })

  it('relacionamento individual: uma transação liquida no máximo uma previsão', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.provider.transactions = [income()]
    await context.container.sync.run({ trigger: 'manual' })

    const [first, second] = context.container.reconciliation.queue().items
    context.container.reconciliation.confirm(first!.candidates[0]!.matchId)

    assert.deepEqual(occurrences(context).map((o) => o.status).sort(), ['expected', 'received_manual'])
    assert.equal(context.container.reconciliation.queue().items.length, 0)
    assert.throws(() => context.container.reconciliation.confirm(second!.candidates[0]!.matchId))

    // O banco também impede um segundo vínculo confirmado para a mesma transação.
    const other = occurrences(context).find((o) => o.status === 'expected')!
    assert.throws(() =>
      context.db
        .prepare(
          `INSERT INTO forecast_matches (occurrence_id, transaction_id, status, origin, created_at)
           VALUES (?, ?, 'confirmed', 'manual', '2026-10-08')`,
        )
        .run(other.id, context.provider.transactions[0]!.id),
    )
  })

  it('transação excluída na origem libera a previsão vinculada', async () => {
    const context = seeded()
    context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.provider.transactions = [income()]
    await context.container.sync.run({ trigger: 'manual' })
    assert.equal(occurrences(context)[0]?.status, 'received_auto')

    context.provider.transactions = []
    await context.container.sync.run({ trigger: 'manual' })
    assert.equal(occurrences(context)[0]?.status, 'expected')
  })
})

describe('previsões', () => {
  it('usa o mês seguinte como competência inicial padrão', () => {
    const context = seeded({ now: '2026-12-15T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '900/3' })
    assert.equal(series.startMonth, '2027-01')
    assert.deepEqual(series.occurrences.map((o) => o.month), ['2027-01', '2027-02', '2027-03'])
  })

  it('o "mês seguinte" segue o fuso de São Paulo, não o UTC', () => {
    // 01/11 às 01:00 UTC ainda é 31/10 em São Paulo.
    const context = seeded({ now: '2026-11-01T01:00:00.000Z' })
    assert.equal(context.container.forecasts.defaultStartMonth(), '2026-11')
  })

  it('altera uma ocorrência sem tocar nas outras', () => {
    const context = seeded()
    const series = context.container.forecasts.create({ expression: '300*3', startMonth: '2026-11' })
    context.container.forecasts.updateOccurrence(series.occurrences[1]!.id, { scope: 'one', amountCents: 35000 })

    assert.deepEqual(occurrences(context).map((o) => o.amountCents), [30000, 35000, 30000])
  })

  it('mantém o sinal ao criar e permite trocar a direção ao editar', () => {
    const context = seeded()
    const series = context.container.forecasts.create({ expression: '-300*2', startMonth: '2026-11' })
    assert.equal(series.totalCents, -60000)
    assert.deepEqual(series.occurrences.map((item) => item.amountCents), [-30000, -30000])

    context.container.forecasts.updateOccurrence(series.occurrences[0]!.id, { scope: 'one', amountCents: 45000 })
    assert.deepEqual(occurrences(context).map((item) => item.amountCents), [45000, -30000])
  })

  it('altera esta e todas as futuras, deslocando as competências juntas', () => {
    const context = seeded()
    const series = context.container.forecasts.create({ expression: '300*4', startMonth: '2026-11' })
    context.container.forecasts.updateOccurrence(series.occurrences[1]!.id, {
      scope: 'future',
      amountCents: 32000,
      month: '2027-01',
    })

    assert.deepEqual(
      occurrences(context).map((o) => [o.month, o.amountCents]),
      [
        ['2026-11', 30000],
        ['2027-01', 32000],
        ['2027-02', 32000],
        ['2027-03', 32000],
      ],
    )
  })

  it('cancela uma ocorrência ou todas as futuras da série', () => {
    const context = seeded()
    const series = context.container.forecasts.create({ expression: '300*4', startMonth: '2026-11' })
    context.container.forecasts.cancelOccurrence(series.occurrences[0]!.id, 'one')
    context.container.forecasts.cancelOccurrence(series.occurrences[2]!.id, 'future')

    assert.deepEqual(occurrences(context).map((o) => o.status), ['cancelled', 'expected', 'cancelled', 'cancelled'])
  })

  it('cobre todos os estados: prevista, atrasada, recebida manualmente, ignorada e cancelada', () => {
    const context = seeded()
    const series = context.container.forecasts.create({ expression: '300*4', startMonth: '2026-09' })
    const [september, october, november, december] = series.occurrences
    context.container.forecasts.setManualStatus(october!.id, 'received_manual')
    context.container.forecasts.setManualStatus(november!.id, 'ignored')
    context.container.forecasts.cancelOccurrence(december!.id, 'one')

    assert.deepEqual(occurrences(context).map((o) => o.displayStatus), [
      'overdue',
      'received_manual',
      'ignored',
      'cancelled',
    ])
    assert.equal(context.container.dashboard.build('2026-10').forecasts.overdueCount, 1)

    context.container.forecasts.setManualStatus(september!.id, 'ignored')
    context.container.forecasts.setManualStatus(november!.id, 'expected')
    assert.deepEqual(occurrences(context).map((o) => o.displayStatus).slice(0, 3), ['ignored', 'received_manual', 'expected'])
  })

  it('não deixa alterar nem cancelar uma previsão já recebida', async () => {
    const context = seeded()
    const series = context.container.forecasts.create({ expression: '300', startMonth: '2026-10' })
    context.provider.transactions = [income()]
    await context.container.sync.run({ trigger: 'manual' })
    const id = series.occurrences[0]!.id

    assert.throws(() => context.container.forecasts.updateOccurrence(id, { scope: 'one', amountCents: 100 }), /em aberto/)
    assert.throws(() => context.container.forecasts.cancelOccurrence(id, 'one'), /já foi realizada/)
    assert.throws(() => context.container.forecasts.setManualStatus(id, 'ignored'), /vinculada/)
  })
})
