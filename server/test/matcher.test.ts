import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { pairKey, planMatches } from '../src/modules/reconciliation/matcher.ts'

const occurrence = (id: number, month: string, amountCents = 30000) => ({ id, month, amountCents })
const credit = (id: string, month: string, amountCents = 30000) => ({ id, month, amountCents })

describe('plano de conciliação', () => {
  it('uma previsão e uma transação no mesmo mês com o mesmo valor: baixa automática', () => {
    const plan = planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-10')])
    assert.deepEqual(plan.auto, [{ occurrenceId: 1, transactionId: 't1' }])
    assert.deepEqual(plan.suggestions, [])
  })

  it('valor diferente por um centavo não vincula', () => {
    const plan = planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-10', 30001)])
    assert.deepEqual(plan, { auto: [], suggestions: [] })
  })

  it('duas transações de mesmo valor no mês: ambiguidade vai para revisão', () => {
    const plan = planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-10'), credit('t2', '2026-10')])
    assert.deepEqual(plan.auto, [])
    assert.deepEqual(plan.suggestions, [
      { occurrenceId: 1, transactionId: 't1', reason: 'ambiguous' },
      { occurrenceId: 1, transactionId: 't2', reason: 'ambiguous' },
    ])
  })

  it('duas previsões de mesmo valor no mês para uma transação: também vai para revisão', () => {
    const plan = planMatches([occurrence(1, '2026-10'), occurrence(2, '2026-10')], [credit('t1', '2026-10')])
    assert.deepEqual(plan.auto, [])
    assert.deepEqual(
      plan.suggestions.map((s) => [s.occurrenceId, s.reason]),
      [
        [1, 'ambiguous'],
        [2, 'ambiguous'],
      ],
    )
  })

  it('recebimento fora do mês esperado vira sugestão, nunca baixa automática', () => {
    const late = planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-11')])
    assert.deepEqual(late.auto, [])
    assert.deepEqual(late.suggestions, [{ occurrenceId: 1, transactionId: 't1', reason: 'out_of_month' }])

    const early = planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-09')])
    assert.equal(early.suggestions[0]?.reason, 'out_of_month')
  })

  it('ignora movimentações distantes demais do mês esperado', () => {
    assert.deepEqual(planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-08')]).suggestions, [])
    assert.deepEqual(planMatches([occurrence(1, '2026-10')], [credit('t1', '2027-02')]).suggestions, [])
  })

  it('série mensal: cada competência encontra o seu recebimento', () => {
    const plan = planMatches(
      [occurrence(1, '2026-09'), occurrence(2, '2026-10'), occurrence(3, '2026-11')],
      [credit('set', '2026-09'), credit('out', '2026-10')],
    )
    assert.deepEqual(plan.auto, [
      { occurrenceId: 1, transactionId: 'set' },
      { occurrenceId: 2, transactionId: 'out' },
    ])
    // A de novembro não reaproveita transações já vinculadas a outras competências.
    assert.deepEqual(plan.suggestions, [])
  })

  it('um par recusado não é vinculado nem proposto de novo', () => {
    const rejected = new Set([pairKey(1, 't1')])
    assert.deepEqual(planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-10')], rejected), {
      auto: [],
      suggestions: [],
    })
  })

  it('depois de uma recusa, o candidato restante continua exigindo confirmação', () => {
    const rejected = new Set([pairKey(1, 't1')])
    const plan = planMatches([occurrence(1, '2026-10')], [credit('t1', '2026-10'), credit('t2', '2026-10')], rejected)
    assert.deepEqual(plan.auto, [])
    assert.deepEqual(plan.suggestions, [{ occurrenceId: 1, transactionId: 't2', reason: 'ambiguous' }])
  })
})
