import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { planMatches } from '../src/modules/reconciliation/matcher.ts'
import { setup } from './support.ts'

const NOW = '2026-10-13T15:00:00.000Z'
const days = (series: { occurrences: { day: string | null }[] }) => series.occurrences.map((occurrence) => occurrence.day)

describe('previsão mensal com dia', () => {
  it('sem dia continua só com a competência', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '300*2', startMonth: '2026-11' })
    assert.equal(series.frequency, 'monthly')
    assert.equal(series.dayOfMonth, null)
    assert.deepEqual(days(series), [null, null])
  })

  it('com dia, cada competência cai nesse dia, limitado ao fim do mês', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-300*4', startMonth: '2026-12', dayOfMonth: 31 })
    assert.equal(series.dayOfMonth, 31)
    assert.deepEqual(days(series), ['2026-12-31', '2027-01-31', '2027-02-28', '2027-03-31'])
    assert.deepEqual(
      series.occurrences.map((occurrence) => occurrence.month),
      ['2026-12', '2027-01', '2027-02', '2027-03'],
    )
  })

  it('a recorrente com dia mantém o dia ao ser estendida', () => {
    const context = setup({ now: NOW })
    const series = context.container.forecasts.create({ expression: '-89,90!', startMonth: '2026-11', dayOfMonth: 30 })
    assert.equal(series.occurrences.length, 12)
    assert.equal(series.occurrences[3]!.day, '2027-02-28')
    assert.equal(series.occurrences.at(-1)!.day, '2027-10-30')

    context.setNow('2026-12-02T15:00:00.000Z')
    assert.equal(context.container.forecasts.series(series.id).occurrences.at(-1)!.day, '2027-12-30')
  })

  it('com dia, fica atrasada no dia seguinte; sem dia, só quando o mês acaba', () => {
    const context = setup({ now: NOW })
    const dated = context.container.forecasts.create({ expression: '100', startMonth: '2026-10', dayOfMonth: 12 })
    const today = context.container.forecasts.create({ expression: '100', startMonth: '2026-10', dayOfMonth: 13 })
    const undated = context.container.forecasts.create({ expression: '100', startMonth: '2026-10' })
    assert.equal(dated.occurrences[0]!.displayStatus, 'overdue')
    assert.equal(today.occurrences[0]!.displayStatus, 'expected')
    assert.equal(undated.occurrences[0]!.displayStatus, 'expected')
  })

  it('recusa dia do mês fora de 1 a 31 e data inicial em previsão mensal', () => {
    const { container } = setup({ now: NOW })
    assert.throws(() => container.forecasts.create({ expression: '100', dayOfMonth: 32 }))
    assert.throws(() => container.forecasts.create({ expression: '100', startDay: '2026-11-03' }))
  })
})

describe('previsão semanal e diária', () => {
  it('semanal repete de sete em sete dias a partir da data inicial', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-120*3', frequency: 'weekly', startDay: '2026-10-30' })
    assert.equal(series.frequency, 'weekly')
    assert.deepEqual(days(series), ['2026-10-30', '2026-11-06', '2026-11-13'])
    assert.deepEqual(
      series.occurrences.map((occurrence) => occurrence.month),
      ['2026-10', '2026-11', '2026-11'],
    )
    assert.equal(series.startMonth, '2026-10')
  })

  it('diária dividida preserva o total', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-100/3', frequency: 'daily', startDay: '2026-10-14' })
    assert.deepEqual(days(series), ['2026-10-14', '2026-10-15', '2026-10-16'])
    assert.deepEqual(
      series.occurrences.map((occurrence) => occurrence.amountCents),
      [-3334, -3333, -3333],
    )
  })

  it('exigem a data inicial e não aceitam mês inicial nem dia do mês', () => {
    const { container } = setup({ now: NOW })
    assert.throws(() => container.forecasts.create({ expression: '50', frequency: 'weekly' }))
    assert.throws(() => container.forecasts.create({ expression: '50', frequency: 'daily', startMonth: '2026-11' }))
    assert.throws(() =>
      container.forecasts.create({ expression: '50', frequency: 'weekly', startDay: '2026-11-03', dayOfMonth: 3 }),
    )
  })

  it('semanal recorrente vai até seis meses à frente e avança com o tempo', () => {
    const context = setup({ now: NOW })
    const series = context.container.forecasts.create({ expression: '-50!', frequency: 'weekly', startDay: '2026-10-16' })
    assert.equal(series.occurrences.at(-1)!.day, '2027-04-09')
    assert.equal(series.occurrences.length, 26)

    context.setNow('2026-10-21T15:00:00.000Z')
    assert.equal(context.container.forecasts.series(series.id).occurrences.at(-1)!.day, '2027-04-16')
  })

  it('diária recorrente vai até três meses à frente', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-30!', frequency: 'daily', startDay: '2026-10-13' })
    assert.equal(series.occurrences.at(-1)!.day, '2027-01-13')
    assert.equal(series.occurrences.length, 93)
  })
})

describe('alterar o dia de uma previsão', () => {
  it('define o dia de uma única ocorrência e a competência acompanha', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '300*2', startMonth: '2026-11' })
    container.forecasts.updateOccurrence(series.occurrences[0]!.id, { scope: 'one', day: '2026-12-05' })
    const after = container.forecasts.series(series.id)
    assert.deepEqual(days(after), ['2026-12-05', null])
    assert.equal(after.occurrences[0]!.month, '2026-12')
    assert.equal(after.dayOfMonth, null)
  })

  it('em "esta e as próximas", a mensal passa a usar o novo dia do mês', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-300!', startMonth: '2026-11', dayOfMonth: 5 })
    container.forecasts.updateOccurrence(series.occurrences[1]!.id, { scope: 'future', day: '2026-12-20' })
    const after = container.forecasts.series(series.id)
    assert.equal(after.dayOfMonth, 20)
    assert.deepEqual(days(after).slice(0, 4), ['2026-11-05', '2026-12-20', '2027-01-20', '2027-02-20'])
  })

  it('em "esta e as próximas", a semanal desloca as seguintes pela mesma diferença', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-50*3', frequency: 'weekly', startDay: '2026-10-16' })
    container.forecasts.updateOccurrence(series.occurrences[1]!.id, { scope: 'future', day: '2026-10-21' })
    assert.deepEqual(days(container.forecasts.series(series.id)), ['2026-10-16', '2026-10-21', '2026-10-28'])
  })

  it('limpar o dia volta a previsão mensal para a competência', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-300*3', startMonth: '2026-11', dayOfMonth: 5 })
    container.forecasts.updateOccurrence(series.occurrences[0]!.id, { scope: 'future', day: null })
    const after = container.forecasts.series(series.id)
    assert.deepEqual(days(after), [null, null, null])
    assert.equal(after.dayOfMonth, null)
  })

  it('semanal e diária não ficam sem dia nem mudam por competência', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-50*2', frequency: 'weekly', startDay: '2026-10-16' })
    const id = series.occurrences[0]!.id
    assert.throws(() => container.forecasts.updateOccurrence(id, { scope: 'one', day: null }))
    assert.throws(() => container.forecasts.updateOccurrence(id, { scope: 'one', month: '2026-12' }))
  })

  it('mudar só a competência de uma mensal com dia mantém o dia do mês', () => {
    const { container } = setup({ now: NOW })
    const series = container.forecasts.create({ expression: '-300', startMonth: '2026-11', dayOfMonth: 31 })
    container.forecasts.updateOccurrence(series.occurrences[0]!.id, { scope: 'one', month: '2026-12' })
    assert.deepEqual(days(container.forecasts.series(series.id)), ['2026-12-31'])
  })
})

describe('conciliação de previsões com dia', () => {
  const occurrence = (id: number, day: string, toleranceDays = 3, amountCents = -5000) => ({
    id,
    month: day.slice(0, 7),
    day,
    toleranceDays,
    amountCents,
  })
  const debit = (id: string, date: string, amountCents = -5000) => ({ id, month: date.slice(0, 7), date, amountCents })

  it('série semanal: cada lançamento baixa a ocorrência mais próxima', () => {
    const plan = planMatches(
      [occurrence(1, '2026-10-02'), occurrence(2, '2026-10-09'), occurrence(3, '2026-10-16')],
      [debit('a', '2026-10-03'), debit('b', '2026-10-09')],
    )
    assert.deepEqual(plan.auto, [
      { occurrenceId: 1, transactionId: 'a' },
      { occurrenceId: 2, transactionId: 'b' },
    ])
    assert.deepEqual(plan.suggestions, [])
  })

  it('diária só baixa o lançamento do próprio dia', () => {
    const plan = planMatches(
      [occurrence(1, '2026-10-05', 0), occurrence(2, '2026-10-06', 0), occurrence(3, '2026-10-07', 0)],
      [debit('a', '2026-10-06')],
    )
    assert.deepEqual(plan.auto, [{ occurrenceId: 2, transactionId: 'a' }])
  })

  it('dois lançamentos na janela da mesma ocorrência não baixam sozinhos', () => {
    const plan = planMatches([occurrence(1, '2026-10-09')], [debit('a', '2026-10-08'), debit('b', '2026-10-10')])
    assert.deepEqual(plan.auto, [])
    assert.equal(plan.suggestions.length, 2)
    assert.ok(plan.suggestions.every((suggestion) => suggestion.reason === 'ambiguous'))
  })

  it('previsão sem dia de mesmo valor no mês impede a baixa automática', () => {
    const plan = planMatches(
      [occurrence(1, '2026-10-09'), { id: 2, month: '2026-10', amountCents: -5000 }],
      [debit('a', '2026-10-09')],
    )
    assert.deepEqual(plan.auto, [])
    assert.equal(plan.suggestions.length, 2)
  })

  it('fora da janela, mas no mês e sem concorrência, vale a regra da competência', () => {
    const plan = planMatches([occurrence(1, '2026-10-05')], [debit('a', '2026-10-20')])
    assert.deepEqual(plan.auto, [{ occurrenceId: 1, transactionId: 'a' }])
  })
})
