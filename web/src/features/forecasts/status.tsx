import {
  CalendarBlankIcon,
  CalendarXIcon,
  CheckCircleIcon,
  EyeSlashIcon,
  HandCoinsIcon,
  ProhibitIcon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import type { OccurrenceDisplayStatus } from '@shared/api'
import type { Tone } from '@/ui/Badge'

/** Rótulo, cor e ícone de cada estado de uma previsão. */
export const OCCURRENCE_STATUS: Record<OccurrenceDisplayStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  expected: { label: 'Prevista', tone: 'neutral', icon: <CalendarBlankIcon size={12} /> },
  overdue: { label: 'Atrasada', tone: 'warning', icon: <CalendarXIcon size={12} /> },
  received_auto: { label: 'Recebida automaticamente', tone: 'positive', icon: <CheckCircleIcon size={12} /> },
  received_manual: { label: 'Recebida manualmente', tone: 'positive', icon: <HandCoinsIcon size={12} /> },
  ignored: { label: 'Ignorada', tone: 'neutral', icon: <EyeSlashIcon size={12} /> },
  cancelled: { label: 'Cancelada', tone: 'neutral', icon: <ProhibitIcon size={12} /> },
}

const OUTFLOW_STATUS: Partial<typeof OCCURRENCE_STATUS> = {
  overdue: { label: 'Pagamento atrasado', tone: 'warning', icon: <CalendarXIcon size={12} /> },
  received_auto: { label: 'Paga automaticamente', tone: 'positive', icon: <CheckCircleIcon size={12} /> },
  received_manual: { label: 'Paga manualmente', tone: 'positive', icon: <HandCoinsIcon size={12} /> },
}

/** Ajusta a linguagem do estado sem transformar o sinal em um status. */
export function occurrenceStatus(status: OccurrenceDisplayStatus, amountCents: number) {
  return amountCents < 0 ? (OUTFLOW_STATUS[status] ?? OCCURRENCE_STATUS[status]) : OCCURRENCE_STATUS[status]
}

export const isOpen = (status: OccurrenceDisplayStatus) => status === 'expected' || status === 'overdue'
export const isReceived = (status: OccurrenceDisplayStatus) => status === 'received_auto' || status === 'received_manual'
