import {
  ArrowCounterClockwiseIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  EyeSlashIcon,
  LinkBreakIcon,
  PencilSimpleIcon,
  ProhibitIcon,
  TextTIcon,
  TrashIcon,
} from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo, useState, type FormEvent } from 'react'
import type { ForecastOccurrence, ForecastScope } from '@shared/api'
import { ForecastExpressionError, parseAmountToCents } from '@shared/forecast-expression'
import { dayOfMonth, withDayOfMonth } from '@shared/days'
import { addMonths, type Month } from '@shared/months'
import { collapseVariants, duration, ease, itemVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatAmountInput, formatBRL, formatDay, formatMonth, plural } from '@/lib/format'
import { invalidateLedger } from '@/lib/query'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { SelectField, TextField } from '@/ui/Field'
import { Menu, type MenuItem } from '@/ui/Menu'
import { Dialog } from '@/ui/Overlay'
import { Segmented } from '@/ui/Segmented'
import { useToast } from '@/ui/Toast'
import { isOpen, isReceived, occurrenceStatus } from './status'

/** Mutação de previsão com o retorno padrão: recarrega os dados e avisa. */
function useForecastAction<T>(action: (input: T) => Promise<unknown>, done: string, onDone?: () => void) {
  const notify = useToast()
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      invalidateLedger()
      notify(done)
      onDone?.()
    },
    onError: (error) => notify(error.message, 'error'),
  })
}

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, index) => index + 1)
const FREQUENCY_LABEL = { monthly: 'Mensal', weekly: 'Semanal', daily: 'Diária' } as const

interface EditorProps {
  occurrence: ForecastOccurrence
  hasLater: boolean
  onClose: () => void
}

function OccurrenceEditor({ occurrence, hasLater, onClose }: EditorProps) {
  const [amount, setAmount] = useState(formatAmountInput(occurrence.amountCents))
  const [month, setMonth] = useState<Month>(occurrence.month)
  const monthly = occurrence.frequency === 'monthly'
  // Na mensal o dia é um dia do mês, opcional; na semanal e na diária é a própria data.
  const [monthDay, setMonthDay] = useState<number | null>(occurrence.day ? dayOfMonth(occurrence.day) : null)
  const [date, setDate] = useState(occurrence.day ?? '')
  const [scope, setScope] = useState<ForecastScope>('one')
  const [error, setError] = useState<string | null>(null)
  const months = useMemo(
    () => Array.from({ length: 31 }, (_, index) => addMonths(occurrence.month, index - 12)),
    [occurrence.month],
  )

  const save = useForecastAction(
    (input: { amountCents?: number; month?: Month; day?: string | null }) =>
      api.forecasts.updateOccurrence(occurrence.id, { scope, ...input }),
    'Previsão atualizada.',
    onClose,
  )

  const submit = (event: FormEvent) => {
    event.preventDefault()
    let amountCents: number
    try {
      amountCents = parseAmountToCents(amount)
    } catch (caught) {
      setError(caught instanceof ForecastExpressionError ? caught.message : 'Valor inválido.')
      return
    }
    setError(null)
    const day = monthly ? (monthDay === null ? null : withDayOfMonth(month, monthDay)) : date
    if (!monthly && !date) return
    const changes = {
      amountCents: amountCents !== occurrence.amountCents ? amountCents : undefined,
      month: monthly && month !== occurrence.month ? month : undefined,
      day: day !== occurrence.day ? day : undefined,
    }
    if (Object.values(changes).every((change) => change === undefined)) return onClose()
    save.mutate(changes)
  }

  return (
    <form onSubmit={submit} className="surface-sunken mt-3 flex flex-col gap-4 rounded-md p-4" noValidate>
      <div className={cn('grid gap-4', monthly ? 'sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7.5rem]' : 'sm:grid-cols-2')}>
        <TextField
          label="Valor"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          inputMode="decimal"
          autoComplete="off"
          error={error}
          data-autofocus
        />
        {monthly ? (
          <>
            <SelectField label="Mês" value={month} onChange={(event) => setMonth(event.target.value)}>
              {months.map((option) => (
                <option key={option} value={option}>
                  {formatMonth(option)}
                </option>
              ))}
            </SelectField>
            <SelectField
              label="Dia"
              value={monthDay ?? ''}
              onChange={(event) => setMonthDay(event.target.value ? Number(event.target.value) : null)}
            >
              <option value="">Sem dia</option>
              {DAYS_OF_MONTH.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </SelectField>
          </>
        ) : (
          <TextField
            label="Data"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            error={date ? undefined : 'Escolha a data.'}
          />
        )}
      </div>
      {hasLater ? (
        <Segmented
          label="Alcance da alteração"
          size="sm"
          options={[
            { value: 'one', label: 'Só esta' },
            { value: 'future', label: 'Esta e as próximas' },
          ]}
          value={scope}
          onChange={setScope}
        />
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" variant="primary" size="sm" loading={save.isPending}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost" onClick={onClose} disabled={save.isPending}>
          Cancelar
        </Button>
      </div>
    </form>
  )
}

function OccurrenceRow({ occurrence }: { occurrence: ForecastOccurrence }) {
  const [editing, setEditing] = useState(false)
  const [dialog, setDialog] = useState<'rename' | 'delete' | null>(null)
  const [name, setName] = useState(occurrence.seriesName ?? '')
  const status = occurrenceStatus(occurrence.displayStatus, occurrence.amountCents)
  // A recorrente sempre tem próximas: as que ainda não foram criadas seguem a última.
  const hasLater = occurrence.recurring || occurrence.sequence < occurrence.seriesSize
  const open = isOpen(occurrence.displayStatus)
  const linked = occurrence.linkedTransaction
  const outflow = occurrence.amountCents < 0

  const setStatus = useForecastAction(
    (next: 'expected' | 'received_manual' | 'ignored') => api.forecasts.setStatus(occurrence.id, next),
    'Previsão atualizada.',
  )
  const cancel = useForecastAction((scope: ForecastScope) => api.forecasts.cancelOccurrence(occurrence.id, scope), 'Previsão cancelada.')
  const undo = useForecastAction(() => api.reconciliation.undo(linked!.matchId), 'Recebimento desfeito.')
  const rename = useForecastAction(
    () => api.forecasts.rename(occurrence.seriesId, name.trim() || null),
    'Nome atualizado.',
    () => setDialog(null),
  )
  const remove = useForecastAction(() => api.forecasts.remove(occurrence.seriesId), 'Série excluída.', () => setDialog(null))

  const actions: MenuItem[] = []
  if (open) {
    actions.push(
      { label: 'Alterar valor ou data', icon: <PencilSimpleIcon />, onSelect: () => setEditing(true) },
      { label: outflow ? 'Marcar como paga' : 'Marcar como recebida', icon: <CheckCircleIcon />, onSelect: () => setStatus.mutate('received_manual') },
      { label: 'Ignorar', icon: <EyeSlashIcon />, onSelect: () => setStatus.mutate('ignored') },
      { label: 'Cancelar esta', icon: <ProhibitIcon />, onSelect: () => cancel.mutate('one') },
    )
    if (hasLater) {
      actions.push({
        label: occurrence.recurring ? 'Encerrar a partir desta' : 'Cancelar esta e as próximas',
        icon: <ProhibitIcon />,
        onSelect: () => cancel.mutate('future'),
      })
    }
  } else if (linked) {
    actions.push({ label: outflow ? 'Desfazer pagamento' : 'Desfazer recebimento', icon: <LinkBreakIcon />, onSelect: () => undo.mutate(undefined) })
  } else {
    actions.push({ label: 'Voltar a prevista', icon: <ArrowCounterClockwiseIcon />, onSelect: () => setStatus.mutate('expected') })
  }
  actions.push(
    { label: 'Renomear série', icon: <TextTIcon />, onSelect: () => setDialog('rename') },
    { label: 'Excluir série inteira', icon: <TrashIcon />, tone: 'danger', onSelect: () => setDialog('delete') },
  )

  const quiet = occurrence.displayStatus === 'cancelled' || occurrence.displayStatus === 'ignored'

  return (
    <motion.li layout="position" variants={itemVariants} initial="initial" animate="enter" exit="exit" className="px-3 py-3">
      <div className="flex items-center gap-3">
        <span
          className={cn(
            'surface-sunken hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex',
            outflow ? 'text-data-expense' : 'text-data-income',
          )}
          aria-hidden
        >
          {outflow ? <ArrowUpRightIcon size={16} /> : <ArrowDownLeftIcon size={16} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={cn('truncate font-medium', quiet ? 'text-text-3' : 'text-text')}>
            {occurrence.seriesName ?? 'Previsão sem nome'}
            {!occurrence.recurring && occurrence.seriesSize > 1 ? (
              <span className="font-normal text-text-3">
                , {occurrence.sequence} de {occurrence.seriesSize}
              </span>
            ) : null}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Badge tone={status.tone} icon={status.icon}>
              {status.label}
            </Badge>
            {occurrence.day ? <span className="tabular text-sm text-text-2">{formatDay(occurrence.day)}</span> : null}
            {occurrence.recurring ? (
              <Badge icon={<ArrowsClockwiseIcon size={12} />}>
                {occurrence.frequency === 'monthly' ? 'Recorrente' : FREQUENCY_LABEL[occurrence.frequency]}
              </Badge>
            ) : null}
            {linked ? (
              <span className="truncate text-sm text-text-3">
                {formatDay(linked.date)}, {linked.description}
              </span>
            ) : null}
          </div>
        </div>
        <p
          className={cn(
            'tabular shrink-0 text-md font-medium',
            quiet ? 'text-text-3' : 'text-text',
          )}
        >
          {formatBRL(occurrence.amountCents)}
        </p>
        <Menu label={`Ações de ${occurrence.seriesName ?? 'previsão'}`} items={actions} />
      </div>

      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div key="editor" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <OccurrenceEditor occurrence={occurrence} hasLater={hasLater} onClose={() => setEditing(false)} />
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Dialog
        open={dialog === 'rename'}
        onClose={() => setDialog(null)}
        title="Renomear série"
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={rename.isPending} onClick={() => rename.mutate(undefined)}>
              Salvar nome
            </Button>
          </>
        }
      >
        <TextField
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="off"
          data-autofocus
          hint={occurrence.seriesSize > 1 ? `Vale para as ${occurrence.seriesSize} previsões da série.` : undefined}
        />
      </Dialog>

      <Dialog
        open={dialog === 'delete'}
        onClose={() => setDialog(null)}
        title="Excluir a série inteira?"
        description={
          occurrence.seriesSize > 1
            ? `As ${occurrence.seriesSize} previsões de "${occurrence.seriesName ?? 'sem nome'}" serão apagadas, inclusive as já realizadas. As transações continuam onde estão.`
            : 'A previsão será apagada. As transações continuam onde estão.'
        }
        footer={
          <>
            <Button variant="ghost" onClick={() => setDialog(null)}>
              Manter
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate(undefined)}>
              Excluir série
            </Button>
          </>
        }
      />
    </motion.li>
  )
}

const counts = (occurrence: ForecastOccurrence) =>
  occurrence.displayStatus !== 'cancelled' && occurrence.displayStatus !== 'ignored'

/** As ocorrências de uma série semanal ou diária dentro de um mês: uma linha que se abre. */
function SeriesGroup({ occurrences }: { occurrences: ForecastOccurrence[] }) {
  const [expanded, setExpanded] = useState(false)
  const first = occurrences[0]!
  const total = occurrences.filter(counts).reduce((sum, item) => sum + item.amountCents, 0)
  const open = occurrences.filter((item) => isOpen(item.displayStatus)).length
  const outflow = first.amountCents < 0

  return (
    <motion.li layout="position" variants={itemVariants} initial="initial" animate="enter" exit="exit">
      <button
        type="button"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
        className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors duration-200 hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span
          className={cn(
            'surface-sunken hidden size-9 shrink-0 items-center justify-center rounded-full sm:flex',
            outflow ? 'text-data-expense' : 'text-data-income',
          )}
          aria-hidden
        >
          <ArrowsClockwiseIcon size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-text">{first.seriesName ?? 'Previsão sem nome'}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
            <Badge icon={<ArrowsClockwiseIcon size={12} />}>{FREQUENCY_LABEL[first.frequency]}</Badge>
            <span>
              {plural(occurrences.length, 'previsão', 'previsões')}, {open} em aberto
            </span>
          </span>
        </span>
        <span className="tabular shrink-0 text-md font-medium text-text">{formatBRL(total)}</span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: duration.state, ease: ease.out }}
          className="flex size-9 shrink-0 items-center justify-center text-text-3"
          aria-hidden
        >
          <CaretDownIcon size={16} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.ul
            key="itens"
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="ml-3 flex flex-col overflow-hidden border-l border-edge sm:ml-7"
          >
            {occurrences.map((occurrence) => (
              <OccurrenceRow key={occurrence.id} occurrence={occurrence} />
            ))}
          </motion.ul>
        ) : null}
      </AnimatePresence>
    </motion.li>
  )
}

type MonthEntry = { key: string; sort: string; occurrences: ForecastOccurrence[]; grouped: boolean }

/** Dentro do mês: primeiro o que não tem dia, depois por data. Séries semanais e diárias viram um grupo. */
function monthEntries(items: ForecastOccurrence[]): MonthEntry[] {
  const entries: MonthEntry[] = []
  const groups = new Map<number, MonthEntry>()
  for (const occurrence of [...items].sort((a, b) => (a.day ?? '').localeCompare(b.day ?? '') || a.id - b.id)) {
    if (occurrence.frequency === 'monthly') {
      entries.push({ key: `o${occurrence.id}`, sort: occurrence.day ?? '', occurrences: [occurrence], grouped: false })
      continue
    }
    const group = groups.get(occurrence.seriesId)
    if (group) {
      group.occurrences.push(occurrence)
      continue
    }
    const created = { key: `s${occurrence.seriesId}`, sort: occurrence.day ?? '', occurrences: [occurrence], grouped: true }
    groups.set(occurrence.seriesId, created)
    entries.push(created)
  }
  return entries
}

/** Previsões agrupadas por competência, com o total de cada mês. */
export function OccurrenceList({ occurrences }: { occurrences: ForecastOccurrence[] }) {
  const groups = useMemo(() => {
    const byMonth = new Map<Month, ForecastOccurrence[]>()
    for (const occurrence of occurrences) {
      const list = byMonth.get(occurrence.month)
      if (list) list.push(occurrence)
      else byMonth.set(occurrence.month, [occurrence])
    }
    return [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, items]) => ({
      month,
      total: items.filter(counts).reduce((sum, item) => sum + item.amountCents, 0),
      entries: monthEntries(items),
    }))
  }, [occurrences])

  return (
    <div className="flex flex-col gap-6">
      <AnimatePresence initial={false} mode="popLayout">
        {groups.map(({ month, total, entries }) => (
          <motion.section key={month} layout="position" variants={itemVariants} initial="initial" animate="enter" exit="exit">
            <header className="flex items-baseline justify-between gap-4 border-b border-edge px-3 pb-2">
              <h2 className="font-sans text-base font-semibold tracking-normal text-text-2">{formatMonth(month)}</h2>
              <p className="tabular text-sm text-text-3">{formatBRL(total)}</p>
            </header>
            <ul className="flex flex-col">
              <AnimatePresence initial={false} mode="popLayout">
                {entries.map((entry) =>
                  entry.grouped && entry.occurrences.length > 1 ? (
                    <SeriesGroup key={entry.key} occurrences={entry.occurrences} />
                  ) : (
                    <OccurrenceRow key={entry.key} occurrence={entry.occurrences[0]!} />
                  ),
                )}
              </AnimatePresence>
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  )
}
