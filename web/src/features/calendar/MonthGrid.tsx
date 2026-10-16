import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useRef, type KeyboardEvent } from 'react'
import type { CalendarEvent } from '@shared/api'
import { addDays, dayOfMonth, monthGrid } from '@shared/days'
import { monthOfDate, type Month } from '@shared/months'
import { swapVariants } from '@/design/motion'
import { cn } from '@/lib/cn'
import { formatDayLong, plural } from '@/lib/format'
import { EventMark, eventKey, eventSentence, eventTitle } from './events'

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
/** Quantos eventos cabem escritos em um dia; o resto vira "+N". */
const VISIBLE = 3

const STEP: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }

interface GridProps {
  month: Month
  today: string
  selected: string
  events: CalendarEvent[]
  /** Escolher um dia de outro mês também troca o mês. */
  onSelect: (day: string) => void
}

/** A grade do mês: cada dia mostra o que acontece nele e abre o detalhe ao lado. */
export function MonthGrid({ month, today, selected, events, onSelect }: GridProps) {
  const weeks = useMemo(() => monthGrid(month), [month])
  const byDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>()
    for (const event of events) {
      const list = map.get(event.date)
      if (list) list.push(event)
      else map.set(event.date, [event])
    }
    return map
  }, [events])

  // Depois de andar com as setas, o foco acompanha o dia escolhido, inclusive ao trocar de mês.
  const gridRef = useRef<HTMLDivElement>(null)
  const followFocus = useRef(false)
  useEffect(() => {
    if (!followFocus.current) return
    const cell = gridRef.current?.querySelector<HTMLButtonElement>(`[data-day="${selected}"]`)
    if (!cell) return
    cell.focus()
    followFocus.current = false
  })

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = STEP[event.key]
    if (!step) return
    event.preventDefault()
    followFocus.current = true
    onSelect(addDays(selected, step))
  }

  return (
    <div ref={gridRef} role="grid" aria-label="Dias do mês" onKeyDown={onKeyDown}>
      <div role="row" className="grid grid-cols-7 border-b border-edge pb-2">
        {WEEKDAYS.map((weekday) => (
          <span key={weekday} role="columnheader" className="px-1 text-center text-xs font-medium text-text-3 sm:px-2 sm:text-left">
            {weekday}
          </span>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={month} variants={swapVariants} initial="initial" animate="enter" exit="exit">
          {weeks.map((week) => (
            <div key={week[0]} role="row" className="grid grid-cols-7 border-b border-edge last:border-b-0">
              {week.map((day) => {
                const items = byDay.get(day) ?? []
                const outside = monthOfDate(day) !== month
                const isToday = day === today
                const isSelected = day === selected
                return (
                  <div key={day} role="gridcell" aria-selected={isSelected} className="min-w-0 p-0.5">
                    <button
                      type="button"
                      data-day={day}
                      tabIndex={isSelected ? 0 : -1}
                      onClick={() => onSelect(day)}
                      aria-label={`${formatDayLong(day)}${isToday ? ', hoje' : ''}. ${
                        items.length ? `${plural(items.length, 'evento', 'eventos')}: ${items.map(eventSentence).join('; ')}` : 'Sem eventos'
                      }`}
                      className={cn(
                        'flex h-14 w-full flex-col items-center gap-1 rounded-md border p-1 text-left transition-colors duration-200 sm:h-28 sm:items-stretch sm:p-1.5',
                        'focus-visible:outline-2 focus-visible:outline-accent',
                        isSelected ? 'border-accent bg-accent-wash' : 'border-transparent hover:bg-fill-hover',
                        outside && !isSelected && 'opacity-45',
                      )}
                    >
                      <span
                        className={cn(
                          'tabular flex size-6 shrink-0 items-center justify-center rounded-full text-sm',
                          isToday ? 'bg-accent font-semibold text-accent-ink' : 'text-text-2',
                        )}
                      >
                        {dayOfMonth(day)}
                      </span>

                      {/* Telas estreitas: só marcadores. O detalhe fica na lista do dia. */}
                      <span className="flex flex-wrap justify-center gap-0.5 sm:hidden" aria-hidden>
                        {items.slice(0, 4).map((item) => (
                          <span key={eventKey(item)} className="size-1.5 rounded-full bg-text-2" />
                        ))}
                      </span>

                      <span className="hidden min-w-0 flex-col gap-0.5 sm:flex" aria-hidden>
                        {items.slice(0, items.length > VISIBLE ? VISIBLE - 1 : VISIBLE).map((item) => (
                          <span key={eventKey(item)} className="flex min-w-0 items-center gap-1 text-xs text-text">
                            <EventMark event={item} />
                            <span className={cn('truncate', item.kind === 'subscription' && !item.charged && 'text-text-2')}>
                              {eventTitle(item)}
                            </span>
                          </span>
                        ))}
                        {items.length > VISIBLE ? <span className="text-xs text-text-3">+{items.length - VISIBLE + 1} eventos</span> : null}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  )
}
