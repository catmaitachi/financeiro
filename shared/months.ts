/** Competência mensal no formato `YYYY-MM`. */
export type Month = string

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/

export function isMonth(value: unknown): value is Month {
  return typeof value === 'string' && MONTH_RE.test(value)
}

function toIndex(month: Month): number {
  return Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1
}

function fromIndex(index: number): Month {
  const year = Math.floor(index / 12)
  const month = (index % 12) + 1
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`
}

export function addMonths(month: Month, delta: number): Month {
  return fromIndex(toIndex(month) + delta)
}

/** Quantos meses `b` está à frente de `a` (negativo se estiver atrás). */
export function monthDiff(a: Month, b: Month): number {
  return toIndex(b) - toIndex(a)
}

/** Competência de uma data civil `YYYY-MM-DD`. */
export function monthOfDate(date: string): Month {
  return date.slice(0, 7)
}

/** Lista de `count` competências consecutivas terminando em `end`. */
export function monthsEndingAt(end: Month, count: number): Month[] {
  return Array.from({ length: count }, (_, i) => addMonths(end, i - count + 1))
}
