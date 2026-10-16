/**
 * Quando cai cada ocorrência de uma previsão. Funções puras.
 *
 * A mensal anda por competência e pode ter um dia do mês; a semanal e a
 * diária andam por data e a competência é a do dia.
 */
import type { ForecastFrequency } from '../../../../shared/api.ts'
import { addDays, shiftMonths, withDayOfMonth } from '../../../../shared/days.ts'
import { addMonths, monthOfDate, type Month } from '../../../../shared/months.ts'

export interface Slot {
  month: Month
  day: string | null
}

const STEP_DAYS = { weekly: 7, daily: 1 } as const

/** Até quantos meses à frente de hoje uma recorrente mantém ocorrências criadas. */
const HORIZON_MONTHS: Record<ForecastFrequency, number> = { monthly: 12, weekly: 6, daily: 3 }

/** Margem, em dias, entre a data prevista e o lançamento que a cumpre sem revisão. */
export const TOLERANCE_DAYS: Record<ForecastFrequency, number> = { monthly: 3, weekly: 3, daily: 0 }

/** A ocorrência `steps` períodos depois de `from`. `anchorDay` é o dia do mês da mensal com dia. */
export function slotAfter(frequency: ForecastFrequency, from: Slot, steps: number, anchorDay: number | null): Slot {
  if (frequency === 'monthly') {
    const month = addMonths(from.month, steps)
    return { month, day: anchorDay === null ? null : withDayOfMonth(month, anchorDay) }
  }
  const day = addDays(from.day!, steps * STEP_DAYS[frequency])
  return { month: monthOfDate(day), day }
}

/** A ocorrência ainda cabe no horizonte de uma recorrente? */
export function withinHorizon(frequency: ForecastFrequency, slot: Slot, today: string): boolean {
  const limit = shiftMonths(today, HORIZON_MONTHS[frequency])
  return frequency === 'monthly' ? slot.month <= monthOfDate(limit) : slot.day! <= limit
}
