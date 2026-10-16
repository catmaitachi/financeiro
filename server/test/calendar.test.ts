import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CARD, seeded, tx } from './support.ts'

const NOW = '2026-10-13T15:00:00.000Z'
const at = (date: string) => `${date}T12:00:00.000Z`

async function scenario() {
  const context = seeded({ now: NOW })
  context.provider.bills = [
    { id: 'bill-out', accountId: CARD, dueDate: '2026-10-10', closingDate: '2026-10-03', totalCents: 50000, currencyCode: 'BRL' },
  ]
  context.provider.transactions = [
    tx({ accountId: CARD, postedAt: at('2026-08-20'), amountCents: 4490, description: 'NETFLIX.COM' }),
    tx({ accountId: CARD, postedAt: at('2026-09-20'), amountCents: 4490, description: 'NETFLIX.COM', billId: 'bill-out' }),
    // Depois do fechamento de outubro: entra na fatura de novembro, que o banco ainda não entregou.
    tx({ accountId: CARD, postedAt: at('2026-10-05'), amountCents: 12000, description: 'Livraria' }),
  ]
  await context.container.sync.run({ trigger: 'manual' })
  const events = (from: string, to: string) => context.container.calendar.events(from, to).events
  return { ...context, events }
}

describe('calendário', () => {
  it('mostra fechamento e vencimento da fatura entregue e estima o ciclo seguinte', async () => {
    const { events } = await scenario()
    const bills = events('2026-10-01', '2026-11-30').filter((event) => event.kind === 'bill_closing' || event.kind === 'bill_due')
    assert.deepEqual(
      bills.map((event) => [event.date, event.kind, event.amountCents, event.estimated, event.kind === 'bill_due' ? event.status : null]),
      [
        ['2026-10-03', 'bill_closing', 50000, false, null],
        ['2026-10-10', 'bill_due', 50000, false, 'closed'],
        ['2026-11-03', 'bill_closing', 12000, true, null],
        ['2026-11-10', 'bill_due', 12000, true, 'open'],
      ],
    )
    assert.equal(bills[0]!.bank.name, 'Banco Exemplo')
  })

  it('fechamento que cai no intervalo aparece mesmo com o vencimento fora dele', async () => {
    const { events } = await scenario()
    assert.deepEqual(
      events('2026-11-01', '2026-11-05').map((event) => [event.date, event.kind]),
      [['2026-11-03', 'bill_closing']],
    )
  })

  it('assinatura só entra depois de confirmada: cobranças feitas e as próximas esperadas', async () => {
    const { container, events } = await scenario()
    const subscriptions = () => events('2026-09-01', '2026-11-30').filter((event) => event.kind === 'subscription')
    assert.deepEqual(subscriptions(), [])

    container.subscriptions.confirm(container.subscriptions.list().subscriptions[0]!.id)
    assert.deepEqual(
      subscriptions().map((event) => [event.date, event.name, event.domain, event.charged, event.amountCents]),
      [
        ['2026-09-20', 'Netflix', 'netflix.com', true, 4490],
        ['2026-10-20', 'Netflix', 'netflix.com', false, 4490],
        ['2026-11-20', 'Netflix', 'netflix.com', false, 4490],
      ],
    )
  })

  it('previsão só aparece quando tem dia, e some se for cancelada', async () => {
    const { container, events } = await scenario()
    container.forecasts.create({ expression: '900', name: 'Sem dia', startMonth: '2026-10' })
    const dated = container.forecasts.create({ expression: '-300*2', name: 'Seguro', startMonth: '2026-10', dayOfMonth: 12 })
    const forecasts = () => events('2026-10-01', '2026-11-30').filter((event) => event.kind === 'forecast')
    assert.deepEqual(
      forecasts().map((event) => [event.date, event.name, event.amountCents, event.status]),
      [
        ['2026-10-12', 'Seguro', -30000, 'overdue'],
        ['2026-11-12', 'Seguro', -30000, 'expected'],
      ],
    )
    container.forecasts.cancelOccurrence(dated.occurrences[1]!.id, 'one')
    assert.equal(forecasts().length, 1)
  })

  it('devolve os eventos em ordem de data e informa o dia de hoje', async () => {
    const { container } = await scenario()
    const range = container.calendar.events('2026-10-01', '2026-10-31')
    assert.equal(range.today, '2026-10-13')
    assert.deepEqual(range.events.map((event) => event.date), [...range.events.map((event) => event.date)].sort())
  })

  it('recusa intervalo invertido ou maior que um trimestre', async () => {
    const { container } = await scenario()
    assert.throws(() => container.calendar.events('2026-10-31', '2026-10-01'))
    assert.throws(() => container.calendar.events('2026-01-01', '2026-12-31'))
  })
})
