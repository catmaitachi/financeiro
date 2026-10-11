import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { ForecastExpressionError, parseForecastExpression } from '../../shared/forecast-expression.ts'
import { setup } from './support.ts'

const fails = (input: string, code: string) =>
  assert.throws(
    () => parseForecastExpression(input),
    (error) => error instanceof ForecastExpressionError && error.code === code,
    `"${input}" deveria falhar com ${code}`,
  )

describe('expressão recorrente', () => {
  it('o sufixo ! marca a previsão como recorrente', () => {
    assert.deepEqual(parseForecastExpression('300!'), {
      mode: 'single',
      totalCents: 30000,
      amountsCents: [30000],
      recurring: true,
    })
    assert.deepEqual(parseForecastExpression(' -1.200,50 ! ').amountsCents, [-120050])
    assert.equal(parseForecastExpression('-300!').recurring, true)
  })

  it('sem o sufixo nada é recorrente', () => {
    assert.equal(parseForecastExpression('300').recurring, false)
    assert.equal(parseForecastExpression('300*3').recurring, false)
    assert.equal(parseForecastExpression('900/3').recurring, false)
  })

  it('recorrente não combina com quantidade de meses', () => {
    fails('300*3!', 'recurring_with_count')
    fails('900/3!', 'recurring_with_count')
  })

  it('o ! só vale no fim, uma única vez', () => {
    fails('!300', 'invalid_syntax')
    fails('300!!', 'invalid_syntax')
    fails('3!00', 'invalid_syntax')
    fails('!', 'invalid_syntax')
  })
})

describe('previsão recorrente', () => {
  const months = (context: ReturnType<typeof setup>, seriesId: number) =>
    context.container.forecasts.series(seriesId).occurrences.map((occurrence) => occurrence.month)

  it('nasce com os meses até um ano à frente do mês atual', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '-300!', name: 'Aluguel', startMonth: '2026-11' })

    assert.equal(series.recurring, true)
    assert.equal(series.occurrences.length, 12)
    assert.equal(series.occurrences[0]!.month, '2026-11')
    assert.equal(series.occurrences.at(-1)!.month, '2027-10')
    assert.ok(series.occurrences.every((occurrence) => occurrence.amountCents === -30000 && occurrence.recurring))
  })

  it('começando além do horizonte, cria só o primeiro mês', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '300!', startMonth: '2028-06' })
    assert.deepEqual(months(context, series.id), ['2028-06'])
  })

  it('ganha os meses seguintes conforme o tempo passa, sem duplicar', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '300!', startMonth: '2026-11' })

    context.setNow('2027-01-15T12:00:00.000Z')
    context.container.forecasts.list()
    const extended = context.container.forecasts.series(series.id).occurrences

    assert.equal(extended.length, 15)
    assert.equal(extended.at(-1)!.month, '2028-01')
    assert.deepEqual(
      extended.map((occurrence) => occurrence.sequence),
      Array.from({ length: 15 }, (_, index) => index + 1),
    )
    assert.ok(extended.every((occurrence) => occurrence.amountCents === 30000))
  })

  it('os meses novos seguem o valor alterado para "esta e as próximas"', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '300!', startMonth: '2026-11' })
    context.container.forecasts.updateOccurrence(series.occurrences[2]!.id, { scope: 'future', amountCents: -45000 })

    context.setNow('2026-12-01T12:00:00.000Z')
    const extended = context.container.forecasts.series(series.id).occurrences

    assert.equal(extended.at(-1)!.month, '2027-12')
    assert.equal(extended.at(-1)!.amountCents, -45000)
    assert.equal(extended[0]!.amountCents, 30000)
  })

  it('cancelar "esta e as próximas" encerra a recorrência', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '300!', startMonth: '2026-11' })
    context.container.forecasts.cancelOccurrence(series.occurrences[3]!.id, 'future')

    context.setNow('2027-06-01T12:00:00.000Z')
    const after = context.container.forecasts.series(series.id)

    assert.equal(after.recurring, false)
    assert.equal(after.occurrences.length, 12)
    assert.deepEqual(
      after.occurrences.map((occurrence) => occurrence.status === 'cancelled'),
      [false, false, false, true, true, true, true, true, true, true, true, true],
    )
  })

  it('cancelar só uma ocorrência mantém a recorrência', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '300!', startMonth: '2026-11' })
    context.container.forecasts.cancelOccurrence(series.occurrences.at(-1)!.id, 'one')

    context.setNow('2026-11-01T12:00:00.000Z')
    const after = context.container.forecasts.series(series.id)

    assert.equal(after.recurring, true)
    assert.equal(after.occurrences.at(-1)!.month, '2027-11')
    assert.equal(after.occurrences.at(-1)!.status, 'expected')
  })

  it('previsões com fim não crescem', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    const series = context.container.forecasts.create({ expression: '300*3', startMonth: '2026-11' })

    context.setNow('2028-01-01T12:00:00.000Z')
    const after = context.container.forecasts.series(series.id)

    assert.equal(after.recurring, false)
    assert.equal(after.occurrences.length, 3)
  })

  it('o painel do mês enxerga a recorrente', () => {
    const context = setup({ now: '2026-10-08T15:00:00.000Z' })
    context.container.forecasts.create({ expression: '300!', startMonth: '2026-10' })
    const march = context.container.dashboard.build('2027-03').forecasts
    assert.equal(march.openCount, 1)
    assert.equal(march.openInCents, 30000)
  })
})
