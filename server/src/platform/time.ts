import { monthOfDate, type Month } from '../../../shared/months.ts'

export const TIME_ZONE = 'America/Sao_Paulo'

/** Relógio injetável, para que regras dependentes de "hoje" sejam testáveis. */
export type Clock = () => Date

export const systemClock: Clock = () => new Date()

const civilDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

const TIMESTAMP_RE = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

/**
 * Data civil (`YYYY-MM-DD`) de um valor entregue pela Pluggy, em America/Sao_Paulo.
 *
 * A Pluggy devolve datas em UTC, mas muitos conectores só conhecem o dia do
 * lançamento e o enviam como meia-noite UTC (`2024-05-01T00:00:00.000Z`).
 * Converter esse instante para São Paulo o jogaria para o dia anterior, e um
 * lançamento do dia 1º mudaria de competência. Por isso, meia-noite UTC exata e
 * valores sem fuso são lidos como a própria data; os demais são convertidos.
 */
export function localDateOf(value: string): string {
  const match = TIMESTAMP_RE.exec(value)
  if (!match) throw new Error(`Data inválida recebida do provedor: ${value}`)
  const [, day, hh, mm, ss, zone] = match
  if (hh === undefined) return day!
  const isMidnight = hh === '00' && mm === '00' && ss === '00'
  if (!zone || (isMidnight && zone === 'Z')) return day!
  return civilDate.format(new Date(value))
}

const clockTime = new Intl.DateTimeFormat('en-GB', {
  timeZone: TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

/**
 * Horário (`HH:mm`, em America/Sao_Paulo) de um valor entregue pela Pluggy, ou
 * `null` quando o banco só informou o dia: valor sem hora, meia-noite UTC
 * (a mesma convenção de `localDateOf`) ou meia-noite de São Paulo, que é como
 * os cartões marcam um lançamento sem horário.
 */
export function localTimeOf(value: string): string | null {
  const match = TIMESTAMP_RE.exec(value)
  if (!match) return null
  const [, , hh, mm, ss, zone] = match
  if (hh === undefined) return null
  if (!zone) return hh === '00' && mm === '00' ? null : `${hh}:${mm}`
  if (hh === '00' && mm === '00' && ss === '00' && zone === 'Z') return null
  const time = clockTime.format(new Date(value))
  return time === '00:00' ? null : time
}

export function todayLocal(clock: Clock): string {
  return civilDate.format(clock())
}

export function currentMonth(clock: Clock): Month {
  return monthOfDate(todayLocal(clock))
}

/** Data civil deslocada em dias (aritmética em UTC para não depender de horário de verão). */
export function addDays(date: string, delta: number): string {
  const utc = new Date(`${date}T00:00:00Z`)
  utc.setUTCDate(utc.getUTCDate() + delta)
  return utc.toISOString().slice(0, 10)
}

export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)
}
