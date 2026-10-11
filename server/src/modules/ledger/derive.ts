/**
 * Regras de consolidação, sem acesso a banco nem a rede.
 * Tudo aqui é função pura para poder ser testado caso a caso.
 */
import type { CompetenceSource, Direction, TransactionKind } from '../../../../shared/api.ts'
import { monthOfDate, type Month } from '../../../../shared/months.ts'
import { daysBetween } from '../../platform/time.ts'

/** Categorias da Pluggy que não representam gasto nem receita. */
const CARD_PAYMENT_ID = '05100000'
const SAME_PERSON_PREFIX = '04'
const TRANSFER_PREFIX = '05'

export interface CategoryRef {
  id: string | null
  /** Descrição em inglês, usada como segunda checagem além do id. */
  description: string | null
}

/** Sentido do dinheiro para o usuário: CREDIT entra, DEBIT sai (conta ou cartão). */
export function directionOf(type: 'DEBIT' | 'CREDIT'): Direction {
  return type === 'CREDIT' ? 'in' : 'out'
}

function isCardPayment(category: CategoryRef): boolean {
  return category.id === CARD_PAYMENT_ID || /^credit card payment$/i.test(category.description ?? '')
}

function isSamePersonTransfer(category: CategoryRef): boolean {
  return (
    (category.id?.startsWith(SAME_PERSON_PREFIX) ?? false) ||
    /^same person transfer/i.test(category.description ?? '')
  )
}

export interface KindInput {
  accountType: 'BANK' | 'CREDIT'
  direction: Direction
  description: string
  category: CategoryRef
  counterpartyDocument: string | null
  ownerDocument: string | null
}

/**
 * Classifica o lançamento olhando apenas para ele mesmo.
 *
 * Pagamentos de fatura e transferências entre contas próprias ficam fora dos
 * gastos consolidados: o gasto já foi contado na compra do cartão, e mover
 * dinheiro entre as próprias contas não é gasto nem receita.
 */
export function kindOf(input: KindInput): TransactionKind {
  if (isCardPayment(input.category)) return 'bill_payment'
  // No cartão, o crédito de "pagamento recebido" é a outra ponta do pagamento da fatura.
  if (input.accountType === 'CREDIT' && input.direction === 'in' && /\bpagamento\b/i.test(input.description)) {
    return 'bill_payment'
  }
  if (isSamePersonTransfer(input.category)) return 'internal_transfer'
  if (
    input.accountType === 'BANK' &&
    input.counterpartyDocument &&
    input.counterpartyDocument === input.ownerDocument
  ) {
    return 'internal_transfer'
  }
  return 'regular'
}

export interface CompetenceInput {
  accountType: 'BANK' | 'CREDIT'
  localDate: string
  billId: string | null
  billForecastMonth: Month | null
}

/** O que a regra de competência precisa saber de uma fatura (datas civis `YYYY-MM-DD`). */
export interface BillRef {
  id: string
  dueDate: string
  closingDate: string | null
}

/**
 * Competência do lançamento.
 *
 * Em conta, é o mês da data. Em cartão, é o mês da fatura: primeiro pelo
 * vencimento da fatura vinculada (`billId`), depois pela previsão informada
 * para faturas abertas. Sem nenhuma das duas, a competência fica vazia
 * ("Fatura não identificada"): o mês da compra nunca é usado como palpite.
 *
 * A previsão só vale enquanto não contradiz o que já se sabe: uma compra feita
 * depois do fechamento de uma fatura não pode pertencer a ela. Há relatos de a
 * previsão oscilar entre sincronizações e apontar para a fatura anterior, já
 * fechada (pluggyai/meu-pluggy#25); nesse caso ela é tratada como não confiável.
 */
export function competenceOf(
  input: CompetenceInput,
  bills: readonly BillRef[],
): { month: Month | null; source: CompetenceSource } {
  if (input.accountType === 'BANK') return { month: monthOfDate(input.localDate), source: 'date' }

  const linked = input.billId ? bills.find((bill) => bill.id === input.billId) : undefined
  if (linked) return { month: monthOfDate(linked.dueDate), source: 'bill' }

  if (input.billForecastMonth) {
    const forecast = bills.find((bill) => monthOfDate(bill.dueDate) === input.billForecastMonth)
    const closedBeforePurchase = forecast?.closingDate != null && input.localDate > forecast.closingDate
    if (!closedBeforePurchase) return { month: input.billForecastMonth, source: 'forecast' }
  }
  return { month: null, source: 'none' }
}

export interface TransferCandidate {
  id: string
  accountId: string
  direction: Direction
  amountCents: number
  localDate: string
  categoryId: string | null
  /** A outra ponta foi identificada e não é o próprio titular. */
  foreignCounterparty: boolean
}

const MAX_TRANSFER_GAP_DAYS = 1

/** Só lançamentos com cara de transferência (ou sem categoria) podem formar par. */
function transferLike(candidate: TransferCandidate): boolean {
  return candidate.categoryId === null || candidate.categoryId.startsWith(TRANSFER_PREFIX)
}

/**
 * Encontra transferências entre contas próprias que a categoria não denunciou:
 * uma saída e uma entrada de mesmo valor, em contas diferentes, com até um dia
 * de distância. Devolve, para cada lançamento pareado, o id da outra ponta.
 */
export function pairInternalTransfers(candidates: readonly TransferCandidate[]): Map<string, string> {
  const pairs = new Map<string, string>()
  const eligible = candidates.filter((c) => transferLike(c) && !c.foreignCounterparty)

  const byAmount = new Map<number, TransferCandidate[]>()
  for (const candidate of eligible) {
    const group = byAmount.get(candidate.amountCents)
    if (group) group.push(candidate)
    else byAmount.set(candidate.amountCents, [candidate])
  }

  const stable = (a: TransferCandidate, b: TransferCandidate) =>
    a.localDate.localeCompare(b.localDate) || a.id.localeCompare(b.id)

  for (const group of byAmount.values()) {
    const outs = group.filter((c) => c.direction === 'out').sort(stable)
    const ins = group.filter((c) => c.direction === 'in').sort(stable)
    for (const out of outs) {
      let best: TransferCandidate | null = null
      let bestGap = Infinity
      for (const candidate of ins) {
        if (pairs.has(candidate.id) || candidate.accountId === out.accountId) continue
        const gap = Math.abs(daysBetween(out.localDate, candidate.localDate))
        if (gap <= MAX_TRANSFER_GAP_DAYS && gap < bestGap) {
          best = candidate
          bestGap = gap
        }
      }
      if (best) {
        pairs.set(out.id, best.id)
        pairs.set(best.id, out.id)
      }
    }
  }
  return pairs
}

/** Texto de busca: minúsculo e sem acentos, para que "cafe" encontre "Café". */
export function searchText(...parts: (string | null)[]): string {
  return parts
    .filter(Boolean)
    .join(' ')
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}
