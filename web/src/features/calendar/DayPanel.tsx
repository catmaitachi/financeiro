import { CalendarBlankIcon, CheckCircleIcon, HourglassIcon, LockSimpleIcon, LockSimpleOpenIcon, QuestionIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { BillStatus, CalendarEvent } from '@shared/api'
import { itemVariants, swapVariants } from '@/design/motion'
import { BankLogo } from '@/features/banks/BankLogo'
import { occurrenceStatus } from '@/features/forecasts/status'
import { ServiceLogo } from '@/features/subscriptions/ServiceLogo'
import { formatBRL, formatDayLong, plural } from '@/lib/format'
import { Badge, type Tone } from '@/ui/Badge'
import { Panel } from '@/ui/Panel'
import { EventMark, eventKey } from './events'

const BILL_STATUS: Record<BillStatus, { label: string; tone: Tone; icon: ReactNode }> = {
  paid: { label: 'Paga', tone: 'positive', icon: <CheckCircleIcon size={12} /> },
  closed: { label: 'Fechada, a pagar', tone: 'accent', icon: <LockSimpleIcon size={12} /> },
  open: { label: 'Aberta', tone: 'neutral', icon: <LockSimpleOpenIcon size={12} /> },
}

const ESTIMATED = (
  <Badge icon={<QuestionIcon size={12} />}>Estimada</Badge>
)

function Row({ mark, title, detail, amount, badges }: { mark: ReactNode; title: string; detail: string; amount: string; badges: ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-3">
      {mark}
      <div className="min-w-0 flex-1">
        <p className="font-medium text-pretty text-text">{title}</p>
        <p className="text-sm text-text-3">{detail}</p>
        <div className="mt-1.5 flex flex-wrap gap-2">{badges}</div>
      </div>
      <p className="tabular shrink-0 font-medium text-text">{amount}</p>
    </div>
  )
}

function EventRow({ event, today }: { event: CalendarEvent; today: string }) {
  switch (event.kind) {
    case 'bill_closing':
      return (
        <Row
          mark={<BankLogo bank={event.bank} />}
          title={`Fechamento ${event.bank.name}`}
          detail="As compras depois deste dia vão para a fatura seguinte."
          amount={formatBRL(event.amountCents)}
          badges={event.estimated ? ESTIMATED : <Badge icon={<LockSimpleIcon size={12} />}>Fechamento</Badge>}
        />
      )
    case 'bill_due': {
      const status = BILL_STATUS[event.status]
      return (
        <Row
          mark={<BankLogo bank={event.bank} />}
          title={`Vencimento ${event.bank.name}`}
          detail="Fatura do cartão"
          amount={formatBRL(event.amountCents)}
          badges={
            <>
              <Badge tone={status.tone} icon={status.icon}>
                {status.label}
              </Badge>
              {event.estimated ? ESTIMATED : null}
            </>
          }
        />
      )
    }
    case 'subscription':
      return (
        <Row
          mark={<ServiceLogo name={event.name} domain={event.domain} />}
          title={event.name}
          detail={event.bank ? `Assinatura, ${event.bank.name}` : 'Assinatura'}
          amount={formatBRL(event.amountCents)}
          badges={
            event.charged ? (
              <Badge tone="positive" icon={<CheckCircleIcon size={12} />}>
                Cobrada
              </Badge>
            ) : (
              <Badge tone={event.date < today ? 'warning' : 'neutral'} icon={<HourglassIcon size={12} />}>
                {event.date < today ? 'Ainda não cobrada' : 'Esperada'}
              </Badge>
            )
          }
        />
      )
    case 'forecast': {
      const status = occurrenceStatus(event.status, event.amountCents)
      return (
        <Row
          mark={
            <span className="surface-sunken flex size-9 shrink-0 items-center justify-center rounded-full" aria-hidden>
              <EventMark event={event} />
            </span>
          }
          title={event.name ?? 'Previsão sem nome'}
          detail={event.amountCents < 0 ? 'Saída prevista' : 'Entrada prevista'}
          amount={formatBRL(event.amountCents)}
          badges={
            <Badge tone={status.tone} icon={status.icon}>
              {status.label}
            </Badge>
          }
        />
      )
    }
  }
}

/** O dia escolhido na grade, por extenso. */
export function DayPanel({ day, today, events, className }: { day: string; today: string; events: CalendarEvent[]; className?: string }) {
  return (
    <Panel className={className} aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={day} variants={swapVariants} initial="initial" animate="enter" exit="exit">
          <header className="mb-2">
            <h2 className="text-lg text-text">{formatDayLong(day)}</h2>
            <p className="mt-1 text-sm text-text-3">
              {day === today ? 'Hoje. ' : ''}
              {events.length ? plural(events.length, 'evento', 'eventos') : 'Nada marcado para este dia.'}
            </p>
          </header>
          {events.length ? (
            <ul className="divide-y divide-edge">
              {events.map((event) => (
                <motion.li key={eventKey(event)} variants={itemVariants} initial="initial" animate="enter">
                  <EventRow event={event} today={today} />
                </motion.li>
              ))}
            </ul>
          ) : (
            <p className="flex items-center gap-2 py-6 text-base text-text-3">
              <CalendarBlankIcon aria-hidden /> Dia livre.
            </p>
          )}
        </motion.div>
      </AnimatePresence>
    </Panel>
  )
}
