import { ArrowsClockwiseIcon, CalendarCheckIcon, CaretLeftIcon, CaretRightIcon, ReceiptIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { monthGrid } from '@shared/days'
import { addMonths, isMonth, monthOfDate, type Month } from '@shared/months'
import { itemVariants, staggerVariants, swapVariants } from '@/design/motion'
import { useSyncOnOpen } from '@/features/sync/useSync'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatMonth, todayIso } from '@/lib/format'
import { keys } from '@/lib/query'
import { Button, IconButton } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { Notice, Skeleton } from '@/ui/Feedback'
import { Panel } from '@/ui/Panel'
import { DayPanel } from './DayPanel'
import { GROUP_OF, type EventGroup } from './events'
import { MonthGrid } from './MonthGrid'

const GROUPS: { id: EventGroup; label: string; icon: ReactNode }[] = [
  { id: 'bills', label: 'Faturas', icon: <ReceiptIcon size={14} /> },
  { id: 'subscriptions', label: 'Assinaturas', icon: <ArrowsClockwiseIcon size={14} /> },
  { id: 'forecasts', label: 'Previsões', icon: <CalendarCheckIcon size={14} /> },
]

/** Calendário do mês: fechamento e vencimento de faturas, cobranças de assinaturas e previsões com dia. */
export default function CalendarPage() {
  useSyncOnOpen()

  const [params, setParams] = useSearchParams()
  const requestedMonth = params.get('mes')
  const requestedDay = params.get('dia')
  const localToday = todayIso()
  const month: Month = isMonth(requestedMonth) ? requestedMonth : monthOfDate(localToday)

  const weeks = useMemo(() => monthGrid(month), [month])
  const from = weeks[0]![0]!
  const to = weeks.at(-1)![6]!
  const calendar = useQuery({
    queryKey: keys.calendar(from, to),
    queryFn: () => api.calendar(from, to),
    // Ao trocar de mês, a grade anterior fica na tela até a nova chegar.
    placeholderData: keepPreviousData,
  })

  const today = calendar.data?.today ?? localToday
  const thisMonth = monthOfDate(today)
  // Sem dia escolhido, vale hoje no mês atual e o dia 1 nos outros.
  const selected =
    requestedDay && requestedDay >= from && requestedDay <= to ? requestedDay : month === thisMonth ? today : `${month}-01`

  const go = (nextMonth: Month, day?: string) => {
    const next: Record<string, string> = {}
    if (nextMonth !== thisMonth) next.mes = nextMonth
    if (day && day !== today) next.dia = day
    setParams(next, { replace: true })
  }
  const select = (day: string) => go(monthOfDate(day), day)

  const [hidden, setHidden] = useState<ReadonlySet<EventGroup>>(new Set())
  const toggle = (group: EventGroup) =>
    setHidden((current) => {
      const next = new Set(current)
      if (!next.delete(group)) next.add(group)
      return next
    })

  const events = useMemo(
    () => (calendar.data?.events ?? []).filter((event) => !hidden.has(GROUP_OF[event.kind])),
    [calendar.data, hidden],
  )
  const dayEvents = useMemo(() => events.filter((event) => event.date === selected), [events, selected])

  return (
    <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col gap-6">
      <motion.header variants={itemVariants} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text">Calendário</h1>
          <p className="mt-1 text-base text-text-3">Faturas, assinaturas e previsões, no dia em que acontecem.</p>
        </div>
        <div className="flex items-center gap-1">
          <IconButton label="Mês anterior" onClick={() => go(addMonths(month, -1))}>
            <CaretLeftIcon />
          </IconButton>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={month}
              variants={swapVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="min-w-40 text-center font-medium text-text"
              aria-live="polite"
            >
              {formatMonth(month)}
            </motion.p>
          </AnimatePresence>
          <IconButton label="Próximo mês" onClick={() => go(addMonths(month, 1))}>
            <CaretRightIcon />
          </IconButton>
          <Button size="sm" className="ml-2" disabled={month === thisMonth && selected === today} onClick={() => go(thisMonth)}>
            Hoje
          </Button>
        </div>
      </motion.header>

      <motion.div variants={itemVariants} className="flex flex-wrap gap-2" role="group" aria-label="O que mostrar no calendário">
        {GROUPS.map((group) => (
          <Chip key={group.id} pressed={!hidden.has(group.id)} onClick={() => toggle(group.id)} icon={group.icon}>
            {group.label}
          </Chip>
        ))}
      </motion.div>

      {calendar.isPending ? (
        <div className="grid gap-6 lg:grid-cols-12" aria-busy="true" aria-label="Carregando o calendário">
          <Skeleton className="h-96 rounded-lg lg:col-span-8" />
          <Skeleton className="h-64 rounded-lg lg:col-span-4" />
        </div>
      ) : !calendar.data ? (
        <Notice
          tone="negative"
          icon={<WarningCircleIcon size={20} />}
          title="Não foi possível montar o calendário"
          action={
            <Button size="sm" onClick={() => void calendar.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {calendar.error?.message}
        </Notice>
      ) : (
        <motion.div
          variants={itemVariants}
          className={cn('grid items-start gap-6 transition-opacity duration-(--dur-state) lg:grid-cols-12', calendar.isPlaceholderData && 'opacity-60')}
        >
          <Panel className="min-w-0 lg:col-span-8">
            <MonthGrid month={month} today={today} selected={selected} events={events} onSelect={select} />
          </Panel>
          <DayPanel day={selected} today={today} events={dayEvents} className="min-w-0 lg:sticky lg:top-6 lg:col-span-4" />
        </motion.div>
      )}

    </motion.div>
  )
}
