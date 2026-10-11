import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
  ForecastExpressionError,
  parseAmountToCents,
  parseForecastExpression,
} from '../../shared/forecast-expression.ts'

const fails = (input: string, code: string) =>
  assert.throws(
    () => parseForecastExpression(input),
    (error) => error instanceof ForecastExpressionError && error.code === code,
    `"${input}" deveria falhar com ${code}`,
  )

describe('expressão de previsão', () => {
  it('valor simples vira uma única competência', () => {
    assert.deepEqual(parseForecastExpression('300'), { mode: 'single', totalCents: 30000, amountsCents: [30000], recurring: false })
  })

  it('aceita saídas com sinal negativo', () => {
    assert.deepEqual(parseForecastExpression('-300'), {
      mode: 'single',
      totalCents: -30000,
      amountsCents: [-30000],
      recurring: false,
    })
    assert.deepEqual(parseForecastExpression('-300*3').amountsCents, [-30000, -30000, -30000])
    assert.deepEqual(parseForecastExpression('-100/3').amountsCents, [-3334, -3333, -3333])
    assert.equal(parseAmountToCents('R$ -1.200,50'), -120050)
    assert.equal(parseAmountToCents('-R$ 89,90'), -8990)
  })

  it('300*3 repete o valor em três competências', () => {
    assert.deepEqual(parseForecastExpression('300*3'), {
      mode: 'repeat',
      totalCents: 90000,
      amountsCents: [30000, 30000, 30000],
      recurring: false,
    })
  })

  it('900/3 divide o total em três competências', () => {
    assert.deepEqual(parseForecastExpression('900/3'), {
      mode: 'split',
      totalCents: 90000,
      amountsCents: [30000, 30000, 30000],
      recurring: false,
    })
  })

  it('distribui os centavos que sobram nas primeiras parcelas, preservando o total', () => {
    const plan = parseForecastExpression('100/3')
    assert.deepEqual(plan.amountsCents, [3334, 3333, 3333])
    assert.equal(plan.amountsCents.reduce((sum, value) => sum + value, 0), plan.totalCents)

    const uneven = parseForecastExpression('1.000,00/7')
    assert.deepEqual(uneven.amountsCents, [14286, 14286, 14286, 14286, 14286, 14285, 14285])
    assert.equal(uneven.amountsCents.reduce((sum, value) => sum + value, 0), 100000)
  })

  it('aceita valores no formato brasileiro', () => {
    assert.equal(parseAmountToCents('1.200,50'), 120050)
    assert.equal(parseAmountToCents('89,9'), 8990)
    assert.equal(parseAmountToCents('1.200'), 120000)
    assert.equal(parseAmountToCents('12.345.678,90'), 1234567890)
    assert.equal(parseAmountToCents('R$ 300'), 30000)
    assert.equal(parseAmountToCents('1200.5'), 120050)
  })

  it('combina formato brasileiro com repetição e divisão', () => {
    assert.deepEqual(parseForecastExpression('1.200,50 * 2').amountsCents, [120050, 120050])
    assert.deepEqual(parseForecastExpression('1.200,50/2').amountsCents, [60025, 60025])
    assert.deepEqual(parseForecastExpression('250x4').amountsCents, [25000, 25000, 25000, 25000])
  })

  it('aceita de 1 a 120 competências', () => {
    assert.equal(parseForecastExpression('10*1').amountsCents.length, 1)
    assert.equal(parseForecastExpression('10*120').amountsCents.length, 120)
    fails('10*0', 'invalid_count')
    fails('10*121', 'invalid_count')
    fails('10/0', 'invalid_count')
    fails('10*2,5', 'invalid_count')
  })

  it('recusa entradas que não entende, com código específico', () => {
    fails('', 'empty')
    fails('   ', 'empty')
    fails('abc', 'invalid_amount')
    fails('0', 'invalid_amount')
    fails('1,234', 'invalid_amount')
    fails('1.20.300', 'invalid_amount')
    fails('300*3*2', 'invalid_syntax')
    fails('300*', 'invalid_syntax')
    fails('*3', 'invalid_syntax')
    fails('-0', 'invalid_amount')
    fails('0,02/3', 'amount_too_small')
    fails('999.999.999,99*120', 'amount_too_large')
  })
})
