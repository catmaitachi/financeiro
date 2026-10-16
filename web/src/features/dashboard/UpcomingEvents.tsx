import { ArrowRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { addDays } from '@shared/days'
import { itemVariants } from '@/design/motion'
import { EventMark, eventKey, eventTitle } from '@/features/calendar/events'
import { api } from '@/lib/api'
import { formatBRL, formatDay, todayIso } from '@/lib/format'
import { keys } from '@/lib/query'
import { LinkButton } from '@/ui/Button'
import { Skeleton } from '@/ui/Feedback'
import { Panel, PanelHeader } from '@/ui/Panel'

/** Quantos dias à frente o painel olha. */
const DAYS = 7

/** O que vem nos próximos dias: faturas, assinaturas e previsões com dia, com o atalho para o calendário. */
export function UpcomingEvents() {
  const from = todayIso()
  const to = addDays(from, DAYS - 1)
  const query = useQuery({ queryKey: keys.calendar(from, to), queryFn: () => api.calendar(from, to) })
  // Cobranças já feitas e previsões já resolvidas não são "o que vem".
  const events = (query.data?.events ?? []).filter(
    (event) =>
      !(event.kind === 'subscription' && event.charged) &&
      !(event.kind === 'bill_due' && event.status === 'paid') &&
      !(event.kind === 'forecast' && (event.status === 'received_auto' || event.status === 'received_manual')),
  )

  return (
    <Panel>
      <PanelHeader
        title="Próximos 7 dias"
        action={
          <LinkButton size="sm" to="/calendario" icon={<ArrowRightIcon />}>
            Calendário
          </LinkButton>
        }
      />
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando os próximos dias">
          {Array.from({ length: 3 }, (_, index) => (
            <Skeleton key={index} className="h-9" />
          ))}
        </div>
      ) : events.length === 0 ? (
        <p className="text-base text-text-3">Nenhuma fatura, assinatura ou previsão com dia nesta semana.</p>
      ) : (
        <ul className="flex flex-col">
          <AnimatePresence initial={false}>
            {events.map((event) => (
              <motion.li key={eventKey(event)} variants={itemVariants} initial="initial" animate="enter" exit="exit" className="flex items-center gap-3 py-2">
                <span className="tabular w-14 shrink-0 text-sm text-text-3">{event.date === from ? 'Hoje' : formatDay(event.date)}</span>
                <EventMark event={event} />
                <span className="min-w-0 flex-1 truncate text-base text-text">{eventTitle(event)}</span>
                {event.kind === 'bill_closing' ? null : (
                  <span className="tabular shrink-0 text-base text-text">{formatBRL(event.amountCents)}</span>
                )}
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
      )}
    </Panel>
  )
}
