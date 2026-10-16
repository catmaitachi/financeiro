import { ArrowDownLeftIcon, ArrowUpRightIcon, LockSimpleIcon, ReceiptIcon } from '@phosphor-icons/react'
import type { CalendarEvent } from '@shared/api'
import { ServiceLogo } from '@/features/subscriptions/ServiceLogo'
import { cn } from '@/lib/cn'
import { formatBRL } from '@/lib/format'

/** Os três assuntos do calendário, que também são os filtros da página. */
export type EventGroup = 'bills' | 'subscriptions' | 'forecasts'

export const GROUP_OF: Record<CalendarEvent['kind'], EventGroup> = {
  bill_closing: 'bills',
  bill_due: 'bills',
  subscription: 'subscriptions',
  forecast: 'forecasts',
}

export const eventKey = (event: CalendarEvent) =>
  event.kind === 'subscription'
    ? `a${event.subscriptionId}:${event.date}`
    : event.kind === 'forecast'
      ? `p${event.occurrenceId}`
      : `${event.kind}:${event.bank.id}:${event.date}`

/** O nome curto do evento, como cabe em um dia da grade. */
export function eventTitle(event: CalendarEvent): string {
  switch (event.kind) {
    case 'bill_closing':
      return `Fecha ${event.bank.name}`
    case 'bill_due':
      return `Vence ${event.bank.name}`
    case 'subscription':
      return event.name
    case 'forecast':
      return event.name ?? formatBRL(event.amountCents)
  }
}

/** A frase completa do evento, para leitores de tela. */
export function eventSentence(event: CalendarEvent): string {
  switch (event.kind) {
    case 'bill_closing':
      return `Fechamento da fatura ${event.bank.name}${event.estimated ? ', data estimada' : ''}`
    case 'bill_due':
      return `Vencimento da fatura ${event.bank.name}, ${formatBRL(event.amountCents)}${event.estimated ? ', estimada' : ''}`
    case 'subscription':
      return `${event.name}, ${formatBRL(event.amountCents)}, ${event.charged ? 'cobrada' : 'cobrança esperada'}`
    case 'forecast':
      return `${event.name ?? 'Previsão'}, ${formatBRL(event.amountCents)}`
  }
}

/** A marca pequena de cada tipo de evento: ícone para o que é do banco e do usuário, logotipo para o serviço. */
export function EventMark({ event, className }: { event: CalendarEvent; className?: string }) {
  if (event.kind === 'subscription') return <ServiceLogo name={event.name} domain={event.domain} size="xs" className={className} />
  const Icon =
    event.kind === 'bill_closing'
      ? LockSimpleIcon
      : event.kind === 'bill_due'
        ? ReceiptIcon
        : event.amountCents < 0
          ? ArrowUpRightIcon
          : ArrowDownLeftIcon
  return (
    <Icon
      size={14}
      aria-hidden
      className={cn(
        'shrink-0',
        event.kind === 'forecast' ? (event.amountCents < 0 ? 'text-data-expense' : 'text-data-income') : 'text-text-2',
        className,
      )}
    />
  )
}
