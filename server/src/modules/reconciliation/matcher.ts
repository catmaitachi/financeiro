/**
 * Decide quais movimentações liquidam quais previsões. Função pura.
 *
 * Baixa automática só acontece quando não há margem para dúvida: na
 * competência esperada existe uma única previsão e uma única transação com
 * aquele valor exato. Todo o resto vira sugestão para revisão humana.
 */
import type { MatchReason } from '../../../../shared/api.ts'
import { monthDiff, type Month } from '../../../../shared/months.ts'

export interface OpenOccurrence {
  id: number
  month: Month
  amountCents: number
}

export interface CreditCandidate {
  id: string
  month: Month
  amountCents: number
}

export interface MatchPlan {
  auto: { occurrenceId: number; transactionId: string }[]
  suggestions: { occurrenceId: number; transactionId: string; reason: MatchReason }[]
}

/** Movimentação fora do mês: até um mês adiantada ou três meses atrasada. */
const EARLY_MONTHS = 1
const LATE_MONTHS = 3

export const pairKey = (occurrenceId: number, transactionId: string) => `${occurrenceId}:${transactionId}`

/**
 * @param occurrences previsões em aberto, ainda sem vínculo
 * @param transactions lançamentos bancários confirmados, assinados e ainda sem vínculo
 * @param rejected pares que o usuário já recusou (não voltam a ser propostos)
 */
export function planMatches(
  occurrences: readonly OpenOccurrence[],
  transactions: readonly CreditCandidate[],
  rejected: ReadonlySet<string> = new Set(),
): MatchPlan {
  const plan: MatchPlan = { auto: [], suggestions: [] }
  const allowed = (o: OpenOccurrence, t: CreditCandidate) => !rejected.has(pairKey(o.id, t.id))

  const amounts = new Set(occurrences.map((o) => o.amountCents))
  for (const amount of amounts) {
    const sameAmountOccurrences = occurrences.filter((o) => o.amountCents === amount)
    const sameAmountTransactions = transactions.filter((t) => t.amountCents === amount)
    if (!sameAmountTransactions.length) continue

    const settledOccurrences = new Set<number>()
    const settledTransactions = new Set<string>()

    // 1. Dentro da competência esperada.
    for (const occurrence of sameAmountOccurrences) {
      const inMonth = sameAmountTransactions.filter((t) => t.month === occurrence.month)
      if (!inMonth.length) continue

      const only = inMonth.length === 1 ? inMonth[0]! : null
      const rivals = only ? sameAmountOccurrences.filter((o) => o.month === only.month) : []
      if (only && rivals.length === 1 && allowed(occurrence, only)) {
        plan.auto.push({ occurrenceId: occurrence.id, transactionId: only.id })
        settledOccurrences.add(occurrence.id)
        settledTransactions.add(only.id)
        continue
      }
      // Valor duplicado de um lado ou de outro: alguém precisa escolher.
      for (const transaction of inMonth) {
        if (allowed(occurrence, transaction)) {
          plan.suggestions.push({ occurrenceId: occurrence.id, transactionId: transaction.id, reason: 'ambiguous' })
        }
      }
    }

    // 2. Previsões sem candidato no mês: procura movimentação adiantada ou atrasada.
    for (const occurrence of sameAmountOccurrences) {
      if (settledOccurrences.has(occurrence.id)) continue
      if (sameAmountTransactions.some((t) => t.month === occurrence.month)) continue
      for (const transaction of sameAmountTransactions) {
        if (settledTransactions.has(transaction.id)) continue
        const distance = monthDiff(occurrence.month, transaction.month)
        if (distance < -EARLY_MONTHS || distance > LATE_MONTHS) continue
        if (allowed(occurrence, transaction)) {
          plan.suggestions.push({ occurrenceId: occurrence.id, transactionId: transaction.id, reason: 'out_of_month' })
        }
      }
    }
  }
  return plan
}
