/**
 * Encontra assinaturas nas saídas do razão. Função pura.
 *
 * Uma assinatura é uma sequência de cobranças do mesmo estabelecimento, com
 * valor parecido, a intervalos regulares. A detecção só sugere: quem decide
 * se o vínculo vale é o usuário.
 */
import type { SubscriptionCadence } from '../../../../shared/api.ts'
import { daysBetween } from '../../../../shared/days.ts'
import { identifyService } from '../../../../shared/services.ts'
import { merchantKey, merchantName } from './merchant-key.ts'

export interface Charge {
  id: string
  date: string
  /** Sempre positivo. */
  amountCents: number
  /** Nome do estabelecimento ou, na falta dele, a descrição do lançamento. */
  text: string
  accountId: string
}

export interface Candidate {
  key: string
  name: string
  serviceId: string | null
  domain: string | null
  cadence: SubscriptionCadence
  /** Valor e conta da cobrança mais recente. */
  amountCents: number
  accountId: string
  lastChargeDate: string
  /** Em ordem de data. */
  chargeIds: string[]
}

/** Intervalo aceito entre duas cobranças seguidas, em dias. */
const GAP: Record<SubscriptionCadence, [min: number, max: number]> = {
  weekly: [6, 8],
  monthly: [25, 35],
  yearly: [350, 380],
}
const CADENCES: readonly SubscriptionCadence[] = ['monthly', 'weekly', 'yearly']

/** Quanto o valor pode variar de uma cobrança para a seguinte (reajuste, câmbio). */
export const AMOUNT_DRIFT = 0.15
const MIN_CHARGES = 3
/** Serviço conhecido ou plano anual: duas cobranças já bastam. */
const MIN_CHARGES_SURE = 2

export const similarAmount = (a: number, b: number, drift = AMOUNT_DRIFT) => Math.abs(a - b) <= Math.max(a, b) * drift

/** Separa as cobranças de um estabelecimento por faixa de valor: a assinatura não se mistura com compras avulsas. */
function byAmount(charges: Charge[]): Charge[][] {
  const clusters: Charge[][] = []
  for (const charge of [...charges].sort((a, b) => a.amountCents - b.amountCents)) {
    const cluster = clusters.at(-1)
    if (cluster && similarAmount(cluster[0]!.amountCents, charge.amountCents)) cluster.push(charge)
    else clusters.push([charge])
  }
  return clusters.map((cluster) => cluster.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id)))
}

/** A sequência mais recente que respeita a cadência, andando da última cobrança para trás. */
function latestRun(charges: Charge[], cadence: SubscriptionCadence): Charge[] {
  const [min, max] = GAP[cadence]
  const run = [charges.at(-1)!]
  for (let index = charges.length - 2; index >= 0; index--) {
    const gap = daysBetween(charges[index]!.date, run[0]!.date)
    if (gap < min || gap > max) break
    run.unshift(charges[index]!)
  }
  return run
}

/**
 * A cadência que melhor explica as datas, pelo intervalo mediano entre elas.
 * Com uma data só, ou intervalos que não batem com nenhuma, fica mensal.
 */
export function inferCadence(dates: readonly string[]): SubscriptionCadence {
  const sorted = [...dates].sort()
  const gaps = sorted.slice(1).map((date, index) => daysBetween(sorted[index]!, date)).sort((a, b) => a - b)
  if (!gaps.length) return 'monthly'
  const median = gaps[Math.floor(gaps.length / 2)]!
  return CADENCES.find((cadence) => median >= GAP[cadence][0] && median <= GAP[cadence][1]) ?? 'monthly'
}

/** As cobranças de cada estabelecimento, pela chave dele. O que não tem chave fica de fora. */
export function groupByMerchant<T extends Charge>(charges: readonly T[]): Map<string, T[]> {
  const groups = new Map<string, T[]>()
  for (const charge of charges) {
    const key = merchantKey(charge.text)
    if (!key) continue
    const group = groups.get(key)
    if (group) group.push(charge)
    else groups.set(key, [charge])
  }
  return groups
}

export function detectSubscriptions(charges: readonly Charge[]): Candidate[] {
  const groups = groupByMerchant(charges)

  const candidates: Candidate[] = []
  for (const [key, group] of groups) {
    const service = identifyService(group[0]!.text)
    let best: { cadence: SubscriptionCadence; run: Charge[] } | null = null
    for (const cluster of byAmount(group)) {
      for (const cadence of CADENCES) {
        const run = latestRun(cluster, cadence)
        const enough = run.length >= (service || cadence === 'yearly' ? MIN_CHARGES_SURE : MIN_CHARGES)
        // Entre faixas de valor, vale a sequência que chega mais perto de hoje; no empate, a mais longa.
        const better =
          !best ||
          run.at(-1)!.date > best.run.at(-1)!.date ||
          (run.at(-1)!.date === best.run.at(-1)!.date && run.length > best.run.length)
        if (enough && better) best = { cadence, run }
      }
    }
    if (!best) continue
    const last = best.run.at(-1)!
    candidates.push({
      key,
      name: service?.name ?? merchantName(last.text),
      serviceId: service?.id ?? null,
      domain: service?.domain ?? null,
      cadence: best.cadence,
      amountCents: last.amountCents,
      accountId: last.accountId,
      lastChargeDate: last.date,
      chargeIds: best.run.map((charge) => charge.id),
    })
  }
  return candidates.sort((a, b) => a.name.localeCompare(b.name))
}
