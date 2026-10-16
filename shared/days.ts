/**
 * Datas civis no formato `YYYY-MM-DD`, sem fuso. A aritmética é feita em UTC
 * para não depender de horário de verão. Roda no servidor e no navegador.
 */
import { addMonths, monthOfDate, type Month } from './months.ts'

const DAY_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

const utc = (date: string) => new Date(`${date}T00:00:00Z`)

export function lastDayOfMonth(month: Month): number {
  return new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate()
}

export function isDay(value: unknown): value is string {
  return typeof value === 'string' && DAY_RE.test(value) && Number(value.slice(8, 10)) <= lastDayOfMonth(value.slice(0, 7))
}

export function addDays(date: string, delta: number): string {
  const shifted = utc(date)
  shifted.setUTCDate(shifted.getUTCDate() + delta)
  return shifted.toISOString().slice(0, 10)
}

/** Quantos dias `b` está à frente de `a` (negativo se estiver atrás). */
export function daysBetween(a: string, b: string): number {
  return Math.round((utc(b).getTime() - utc(a).getTime()) / 86_400_000)
}

/** O dia pedido dentro de uma competência, limitado ao último dia dela. */
export function withDayOfMonth(month: Month, dayOfMonth: number): string {
  return `${month}-${String(Math.min(dayOfMonth, lastDayOfMonth(month))).padStart(2, '0')}`
}

export function dayOfMonth(date: string): number {
  return Number(date.slice(8, 10))
}

/** Desloca uma data em meses, mantendo o dia quando ele existe no mês de destino. */
export function shiftMonths(date: string, months: number): string {
  return withDayOfMonth(addMonths(monthOfDate(date), months), dayOfMonth(date))
}

/** Dia da semana, de 0 (domingo) a 6 (sábado). */
export function weekdayOf(date: string): number {
  return utc(date).getUTCDay()
}

/** As semanas que cobrem um mês, de domingo a sábado, incluindo os dias vizinhos que as completam. */
export function monthGrid(month: Month): string[][] {
  const first = `${month}-01`
  const start = addDays(first, -weekdayOf(first))
  const weeks = Math.ceil((weekdayOf(first) + lastDayOfMonth(month)) / 7)
  return Array.from({ length: weeks }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => addDays(start, week * 7 + day)),
  )
}
