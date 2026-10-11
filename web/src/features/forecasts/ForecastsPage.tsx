import { ArrowDownLeftIcon, ArrowUpRightIcon, CalendarCheckIcon, EqualsIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useMemo, useState } from 'react'
import type { ForecastOccurrence } from '@shared/api'
import { addMonths } from '@shared/months'
import { itemVariants, staggerVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { plural } from '@/lib/format'
import { keys } from '@/lib/query'
import { Button } from '@/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/ui/Feedback'
import { Panel } from '@/ui/Panel'
import { Money } from '@/ui/Money'
import { Segmented } from '@/ui/Segmented'
import { ForecastComposer } from './ForecastComposer'
import { OccurrenceList } from './OccurrenceList'
import { ReviewQueue } from './ReviewQueue'
import { isOpen, isReceived } from './status'

type View = 'open' | 'received' | 'all'

const EMPTY_VIEW: Record<View, string> = {
  open: 'Nenhuma previsão em aberto.',
  received: 'Nenhuma previsão realizada ainda.',
  all: 'Nenhuma previsão cadastrada.',
}

function ForecastSummary({ occurrences }: { occurrences: ForecastOccurrence[] }) {
  const active = occurrences.filter((item) => isOpen(item.displayStatus))
  const incoming = active.reduce((sum, item) => sum + Math.max(item.amountCents, 0), 0)
  const outgoing = active.reduce((sum, item) => sum + Math.abs(Math.min(item.amountCents, 0)), 0)
  const net = incoming - outgoing

  return (
    <Panel aria-label="Resumo das previsões em aberto">
      <div className="grid gap-6 sm:grid-cols-3 sm:items-end">
        <div className="sm:col-span-1">
          <div className="flex items-center gap-2 text-sm font-medium text-text-3">
            <EqualsIcon size={16} />
            Saldo previsto
          </div>
          <Money
            cents={net}
            className={cn('mt-2 block text-2xl font-semibold', net < 0 ? 'text-data-expense' : 'text-data-income')}
          />
          <p className="mt-1 text-sm text-text-3">{plural(active.length, 'movimentação em aberto', 'movimentações em aberto')}</p>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:col-span-2">
          <div className="surface-sunken rounded-md p-4">
            <div className="flex items-center gap-2 text-sm text-text-3">
              <ArrowDownLeftIcon size={16} className="text-data-income" />
              A receber
            </div>
            <Money cents={incoming} className="mt-2 block text-md font-semibold text-data-income" />
          </div>
          <div className="surface-sunken rounded-md p-4">
            <div className="flex items-center gap-2 text-sm text-text-3">
              <ArrowUpRightIcon size={16} className="text-data-expense" />
              A pagar
            </div>
            <Money cents={outgoing} className="mt-2 block text-md font-semibold text-data-expense" />
          </div>
        </div>
      </div>
    </Panel>
  )
}

export default function ForecastsPage() {
  const [view, setView] = useState<View>('open')
  const forecasts = useQuery({ queryKey: keys.forecasts, queryFn: api.forecasts.list })
  const review = useQuery({ queryKey: keys.reconciliation, queryFn: api.reconciliation.queue })

  const occurrences = useMemo(() => (forecasts.data?.series ?? []).flatMap((series) => series.occurrences), [forecasts.data])
  const visible = useMemo(
    () =>
      occurrences.filter((occurrence) =>
        view === 'open' ? isOpen(occurrence.displayStatus) : view === 'received' ? isReceived(occurrence.displayStatus) : true,
      ),
    [occurrences, view],
  )

  if (forecasts.isPending) {
    return (
      <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando previsões">
        <Skeleton className="h-11 w-56" />
        <div className="grid gap-6 lg:grid-cols-12">
          <Skeleton className="h-96 rounded-lg lg:col-span-5" />
          <Skeleton className="h-96 rounded-lg lg:col-span-7" />
        </div>
      </div>
    )
  }

  if (!forecasts.data) {
    return (
      <Notice
        tone="negative"
        icon={<WarningCircleIcon size={20} />}
        title="Não foi possível carregar as previsões"
        action={
          <Button size="sm" onClick={() => void forecasts.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {forecasts.error?.message}
      </Notice>
    )
  }

  // O servidor informa o mês padrão (o seguinte ao atual, no fuso de São Paulo).
  const { defaultStartMonth } = forecasts.data
  const currentMonth = addMonths(defaultStartMonth, -1)

  return (
    <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col gap-6">
      <motion.header variants={itemVariants}>
        <h1 className="text-2xl text-text">Previsões</h1>
        <p className="mt-1 text-base text-text-3">Entradas e saídas futuras, organizadas mês a mês.</p>
      </motion.header>

      <ForecastSummary occurrences={occurrences} />

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-5">
          <ForecastComposer defaultStartMonth={defaultStartMonth} currentMonth={currentMonth} />
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <ReviewQueue items={review.data?.items ?? []} />

          <Panel padded={false} className="p-3">
            <div className="p-3 pb-4">
              <Segmented
                label="Quais previsões mostrar"
                size="sm"
                className="w-full sm:w-80"
                options={[
                  { value: 'open', label: 'Em aberto' },
                  { value: 'received', label: 'Realizadas' },
                  { value: 'all', label: 'Todas' },
                ]}
                value={view}
                onChange={setView}
              />
            </div>
            {occurrences.length === 0 ? (
              <EmptyState icon={<CalendarCheckIcon size={22} />} title="Nenhuma previsão ainda">
                Cadastre o que espera receber ou pagar. Quando a movimentação acontecer, a previsão é baixada sozinha.
              </EmptyState>
            ) : visible.length === 0 ? (
              <p className="px-3 py-10 text-center text-base text-text-3">{EMPTY_VIEW[view]}</p>
            ) : (
              <OccurrenceList occurrences={visible} />
            )}
          </Panel>
        </div>
      </div>
    </motion.div>
  )
}
