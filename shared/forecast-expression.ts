/**
 * Gramática das previsões de caixa.
 *
 *   300        uma previsão de R$ 300,00
 *   -300       uma saída prevista de R$ 300,00
 *   300*3      três competências de R$ 300,00
 *   900/3      R$ 900,00 divididos em três competências
 *   300!       R$ 300,00 todo mês, sem data para acabar
 *
 * Valores aceitam o formato brasileiro (`1.200,50`). O mesmo módulo roda no
 * servidor (fonte da verdade) e no navegador (pré-visualização enquanto digita).
 */

export const MAX_INSTALLMENTS = 120
const MAX_TOTAL_CENTS = 99_999_999_999 // R$ 999.999.999,99

export type ForecastMode = 'single' | 'repeat' | 'split'

export interface ForecastPlan {
  mode: ForecastMode
  totalCents: number
  /** Um valor em centavos por competência, na ordem. Na recorrente, só o valor mensal. */
  amountsCents: number[]
  /** Repete todo mês sem fim definido (sufixo `!`). */
  recurring: boolean
}

export type ForecastExpressionErrorCode =
  | 'empty'
  | 'invalid_syntax'
  | 'invalid_amount'
  | 'invalid_count'
  | 'recurring_with_count'
  | 'amount_too_large'
  | 'amount_too_small'

const MESSAGES: Record<ForecastExpressionErrorCode, string> = {
  empty: 'Informe um valor, por exemplo 300, -300, 300*3, 900/3 ou 300!.',
  invalid_syntax: 'Use um valor simples (300), negativo (-300), repetido (300*3), dividido (900/3) ou recorrente (300!).',
  invalid_amount: 'Não entendi o valor. Exemplos válidos: 300, -300, 1.200,50 ou 89,90.',
  invalid_count: `A quantidade de meses deve ser um número inteiro entre 1 e ${MAX_INSTALLMENTS}.`,
  recurring_with_count: 'Uma previsão recorrente não tem quantidade de meses. Use só o valor, como 300!.',
  amount_too_large: 'O valor é alto demais para uma previsão.',
  amount_too_small: 'O valor é pequeno demais para dividir nessa quantidade de meses.',
}

export class ForecastExpressionError extends Error {
  readonly code: ForecastExpressionErrorCode

  constructor(code: ForecastExpressionErrorCode) {
    super(MESSAGES[code])
    this.name = 'ForecastExpressionError'
    this.code = code
  }
}

/** Converte um valor digitado (`1.200,50`, `-300`, `R$ 300`) em centavos. */
export function parseAmountToCents(input: string): number {
  let text = input.trim().replace(/\s+/g, '')
  // O sinal pode vir antes ou depois do símbolo: `-R$ 300` e `R$ -300`.
  text = text.replace(/^(-?)R\$/i, '$1').replace(/^R\$(-?)/i, '$1')
  const sign = text.startsWith('-') ? -1 : 1
  if (sign < 0) text = text.slice(1)
  let integer: string
  let fraction = ''

  if (text.includes(',')) {
    // Formato brasileiro: ponto separa milhares, vírgula separa centavos.
    const match = /^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/.exec(text)
    if (!match) throw new ForecastExpressionError('invalid_amount')
    integer = match[1]!.replaceAll('.', '')
    fraction = match[2]!
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    integer = text.replaceAll('.', '')
  } else {
    const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(text)
    if (!match) throw new ForecastExpressionError('invalid_amount')
    integer = match[1]!
    fraction = match[2] ?? ''
  }

  const absoluteCents = Number(integer) * 100 + Number(fraction.padEnd(2, '0') || '0')
  if (!Number.isSafeInteger(absoluteCents) || absoluteCents > MAX_TOTAL_CENTS) {
    throw new ForecastExpressionError('amount_too_large')
  }
  if (absoluteCents === 0) throw new ForecastExpressionError('invalid_amount')
  return absoluteCents * sign
}

function parseCount(input: string): number {
  if (!/^\d{1,4}$/.test(input)) throw new ForecastExpressionError('invalid_count')
  const count = Number(input)
  if (count < 1 || count > MAX_INSTALLMENTS) throw new ForecastExpressionError('invalid_count')
  return count
}

export function parseForecastExpression(input: string): ForecastPlan {
  const typed = input.trim()
  if (!typed) throw new ForecastExpressionError('empty')

  // O `!` só vale como sufixo, uma única vez.
  const recurring = typed.endsWith('!')
  const text = recurring ? typed.slice(0, -1).trim() : typed
  if (!text || text.includes('!')) throw new ForecastExpressionError('invalid_syntax')

  const operators = text.match(/[*x×/]/gi) ?? []
  if (operators.length > 1) throw new ForecastExpressionError('invalid_syntax')
  if (recurring && operators.length > 0) throw new ForecastExpressionError('recurring_with_count')

  if (operators.length === 0) {
    const cents = parseAmountToCents(text)
    return { mode: 'single', totalCents: cents, amountsCents: [cents], recurring }
  }

  const operator = operators[0]!
  const [left = '', right = ''] = text.split(operator).map((part) => part.trim())
  if (!left || !right) throw new ForecastExpressionError('invalid_syntax')

  const amount = parseAmountToCents(left)
  const count = parseCount(right)

  if (operator === '/') {
    const sign = amount < 0 ? -1 : 1
    const absoluteAmount = Math.abs(amount)
    const base = Math.floor(absoluteAmount / count)
    if (base === 0) throw new ForecastExpressionError('amount_too_small')
    const remainder = absoluteAmount % count
    // Os centavos que sobram vão para as primeiras parcelas, preservando o total.
    const amountsCents = Array.from({ length: count }, (_, i) => (base + (i < remainder ? 1 : 0)) * sign)
    return { mode: 'split', totalCents: amount, amountsCents, recurring: false }
  }

  const totalCents = amount * count
  if (Math.abs(totalCents) > MAX_TOTAL_CENTS) throw new ForecastExpressionError('amount_too_large')
  return { mode: 'repeat', totalCents, amountsCents: Array.from({ length: count }, () => amount), recurring: false }
}
