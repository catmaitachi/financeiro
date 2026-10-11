import type { Month } from '@shared/months'
import { MASK, valuesHidden } from './privacy'

const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const plain = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatBRL(cents: number): string {
  if (valuesHidden()) return MASK
  return brl.format(cents / 100)
}

/** Valor em qualquer moeda; cai no código da moeda se ela não for reconhecida. */
export function formatMoney(cents: number, currencyCode: string): string {
  if (valuesHidden()) return MASK
  if (currencyCode === 'BRL') return formatBRL(cents)
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: currencyCode }).format(cents / 100)
  } catch {
    return `${currencyCode} ${plain.format(cents / 100)}`
  }
}

/** Valor sem símbolo, para preencher campos de edição: `1.200,50`. */
export function formatAmountInput(cents: number): string {
  return plain.format(cents / 100)
}

const monthDate = (month: Month) => new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1, 1)

const longMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' })
const onlyMonth = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
const shortMonth = new Intl.DateTimeFormat('pt-BR', { month: 'short' })

const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1)

/** "Outubro de 2026" */
export function formatMonth(month: Month): string {
  return capitalize(longMonth.format(monthDate(month)))
}

/** "outubro" */
export function formatMonthName(month: Month): string {
  return onlyMonth.format(monthDate(month))
}

/** "out" */
export function formatMonthShort(month: Month): string {
  return shortMonth.format(monthDate(month)).replace('.', '')
}

/** "out/26" */
export function formatMonthCompact(month: Month): string {
  return `${formatMonthShort(month)}/${month.slice(2, 4)}`
}

const civil = (date: string) => new Date(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)))

const dayMonth = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' })
const fullDate = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })
const numericDate = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** "5 de out" */
export function formatDay(date: string): string {
  return dayMonth.format(civil(date)).replace('.', '')
}

/** "Segunda-feira, 5 de outubro" */
export function formatDayLong(date: string): string {
  return capitalize(fullDate.format(civil(date)))
}

/** "05/10/2026" */
export function formatDate(date: string): string {
  return numericDate.format(civil(date))
}

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto' })

/** "há 5 minutos", "ontem" */
export function formatRelative(iso: string, now = Date.now()): string {
  const seconds = Math.round((Date.parse(iso) - now) / 1000)
  const abs = Math.abs(seconds)
  if (abs < 45) return 'agora há pouco'
  if (abs < 3600) return relative.format(Math.round(seconds / 60), 'minute')
  if (abs < 86_400) return relative.format(Math.round(seconds / 3600), 'hour')
  return relative.format(Math.round(seconds / 86_400), 'day')
}

/** A data de hoje no calendário local, como "2026-10-08". */
export function todayIso(): string {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** "3 transações", "1 transação" */
export function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`
}
