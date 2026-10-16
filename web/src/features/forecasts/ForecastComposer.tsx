import { ArrowDownLeftIcon, ArrowUpRightIcon, PlusIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ForecastExpressionError, parseForecastExpression, type ForecastPlan } from '@shared/forecast-expression'
import type { ForecastFrequency } from '@shared/api'
import { addDays } from '@shared/days'
import { addMonths, type Month } from '@shared/months'
import { collapseVariants, swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatBRL, formatDay, formatMonth, formatMonthName, todayIso } from '@/lib/format'
import { invalidateLedger } from '@/lib/query'
import { Button } from '@/ui/Button'
import { SelectField, TextField } from '@/ui/Field'
import { Panel, PanelHeader } from '@/ui/Panel'
import { Segmented, type SegmentedOption } from '@/ui/Segmented'
import { useToast } from '@/ui/Toast'

/** Quando a previsão acontece: o que o cadastro envia além do valor. */
export interface PlanSchedule {
  frequency?: ForecastFrequency
  /** Mensal com dia fixo. */
  dayOfMonth?: number | null
  /** Primeira data da semanal e da diária. */
  startDay?: string
}

const PERIOD = {
  monthly: { every: 'todo mês', each: 'uma por mês', many: 'meses', oneOf: 'um mês' },
  weekly: { every: 'toda semana', each: 'uma por semana', many: 'semanas', oneOf: 'uma semana' },
  daily: { every: 'todo dia', each: 'uma por dia', many: 'dias', oneOf: 'um dia' },
} as const

const STEP_DAYS = { weekly: 7, daily: 1 } as const

/** O que a expressão vai criar, dito por extenso. */
export function describePlan(plan: ForecastPlan, start: Month, schedule: PlanSchedule = {}): string {
  const frequency = schedule.frequency ?? 'monthly'
  const period = PERIOD[frequency]
  const count = plan.amountsCents.length
  const first = plan.amountsCents[0]!
  const last = plan.amountsCents[count - 1]!
  const outflow = plan.totalCents < 0
  const kind = outflow ? 'saída' : 'entrada'
  const money = (cents: number) => formatBRL(Math.abs(cents))

  let from: string
  let range: string
  let on = ''
  if (frequency === 'monthly') {
    from = formatMonth(start).toLowerCase()
    range = `de ${formatMonthName(start)} a ${formatMonth(addMonths(start, count - 1)).toLowerCase()}`
    if (schedule.dayOfMonth) on = `, no dia ${schedule.dayOfMonth}`
  } else {
    const startDay = schedule.startDay
    if (!startDay) return 'Escolha a data da primeira ocorrência.'
    from = formatDay(startDay)
    range = `de ${formatDay(startDay)} a ${formatDay(addDays(startDay, (count - 1) * STEP_DAYS[frequency]))}`
  }

  if (plan.recurring) return `Uma ${kind} de ${money(first)} ${period.every}${on}, a partir de ${from}.`
  if (count === 1) return `Uma ${kind} de ${money(first)} em ${from}${on}.`
  if (plan.mode === 'repeat') {
    return `${count} ${outflow ? 'saídas' : 'entradas'} de ${money(first)}, ${period.each}${on}, ${range}. Total de ${money(plan.totalCents)}.`
  }
  if (first === last) return `${money(plan.totalCents)} em ${count} ${period.many} de ${money(first)}${on}, ${range}.`
  // Divisão com centavos de sobra: as primeiras parcelas levam um centavo a mais.
  const larger = plan.amountsCents.filter((amount) => amount === first).length
  return `${money(plan.totalCents)} em ${count} ${period.many}${on}, ${range}: ${larger} de ${money(first)} e ${count - larger} de ${money(last)}.`
}

/** A gramática do campo Valor, um exemplo por linha, na unidade da frequência escolhida. */
const examples = (frequency: ForecastFrequency): [example: string, meaning: string][] => [
  ['300', `Entrada de R$ 300 em ${PERIOD[frequency].oneOf}`],
  ['-300', 'Saída, com o sinal de menos'],
  ['300*3', `Repete por 3 ${PERIOD[frequency].many}`],
  ['900/3', `Divide em 3 ${PERIOD[frequency].many}`],
  ['300!', `Repete ${PERIOD[frequency].every}, sem fim`],
]

const FREQUENCIES: SegmentedOption<ForecastFrequency>[] = [
  { value: 'monthly', label: 'Mensal' },
  { value: 'weekly', label: 'Semanal' },
  { value: 'daily', label: 'Diária' },
]

const DAYS_OF_MONTH = Array.from({ length: 31 }, (_, index) => index + 1)

interface ComposerProps {
  defaultStartMonth: Month
  currentMonth: Month
}

/** Cadastro de previsão com a gramática `300`, `300*3`, `900/3` e `300!`, em qualquer frequência, com prévia enquanto digita. */
export function ForecastComposer({ defaultStartMonth, currentMonth }: ComposerProps) {
  const notify = useToast()
  const [expression, setExpression] = useState('')
  const [name, setName] = useState('')
  const [frequency, setFrequency] = useState<ForecastFrequency>('monthly')
  const [startMonth, setStartMonth] = useState<Month>(defaultStartMonth)
  useEffect(() => setStartMonth(defaultStartMonth), [defaultStartMonth])
  const [dayOfMonth, setDayOfMonth] = useState<number | null>(null)
  const [startDay, setStartDay] = useState(todayIso)
  const monthly = frequency === 'monthly'

  // O mesmo analisador do servidor: a prévia nunca promete algo que o cadastro recusaria.
  const parsed = useMemo(() => {
    if (!expression.trim()) return null
    try {
      return { plan: parseForecastExpression(expression), error: null }
    } catch (error) {
      return { plan: null, error: error instanceof ForecastExpressionError ? error.message : 'Valor inválido.' }
    }
  }, [expression])

  const create = useMutation({
    mutationFn: api.forecasts.create,
    onSuccess: (series) => {
      invalidateLedger()
      setExpression('')
      setName('')
      notify(
        series.recurring
          ? 'Previsão recorrente adicionada.'
          : series.occurrences.length === 1
            ? 'Previsão adicionada.'
            : `${series.occurrences.length} previsões adicionadas.`,
      )
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!ready) return
    create.mutate({
      expression,
      name: name.trim() || null,
      frequency,
      ...(monthly ? { startMonth, dayOfMonth: dayOfMonth ?? undefined } : { startDay }),
    })
  }

  const months = useMemo(() => Array.from({ length: 25 }, (_, index) => addMonths(currentMonth, index - 6)), [currentMonth])
  const preview = parsed?.plan ? describePlan(parsed.plan, startMonth, { frequency, dayOfMonth, startDay }) : null
  const ready = !!parsed?.plan && (monthly || !!startDay)
  const isOutflow = (parsed?.plan?.totalCents ?? 0) < 0

  return (
    <Panel>
      <PanelHeader title="Nova previsão" />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <Segmented label="Frequência" options={FREQUENCIES} value={frequency} onChange={setFrequency} className="self-start" />
        <TextField
          label="Valor"
          typed
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          placeholder="Ex.: 300"
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          error={parsed?.error}
          focusHint={
            <ul className="flex flex-col gap-2">
              {examples(frequency).map(([example, meaning]) => (
                <li key={example} className="flex items-baseline gap-3">
                  <span className="tabular w-12 shrink-0 font-medium text-text">{example}</span>
                  <span>{meaning}</span>
                </li>
              ))}
            </ul>
          }
        />
        <TextField
          label="Nome (opcional)"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Aluguel da sala comercial"
          maxLength={80}
          autoComplete="off"
        />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={monthly ? 'mensal' : 'por-data'}
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="overflow-hidden"
          >
            {monthly ? (
              <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] gap-3">
                <SelectField label="Primeiro mês" value={startMonth} onChange={(event) => setStartMonth(event.target.value)}>
                  {months.map((month) => (
                    <option key={month} value={month}>
                      {formatMonth(month)}
                    </option>
                  ))}
                </SelectField>
                <SelectField
                  label="Dia (opcional)"
                  value={dayOfMonth ?? ''}
                  onChange={(event) => setDayOfMonth(event.target.value ? Number(event.target.value) : null)}
                >
                  <option value="">Sem dia</option>
                  {DAYS_OF_MONTH.map((day) => (
                    <option key={day} value={day}>
                      {day}
                    </option>
                  ))}
                </SelectField>
              </div>
            ) : (
              <TextField
                label="Começa em"
                type="date"
                value={startDay}
                onChange={(event) => setStartDay(event.target.value)}
                error={startDay ? undefined : 'Escolha a data da primeira ocorrência.'}
              />
            )}
          </motion.div>
        </AnimatePresence>

        <div
          className={cn(
            'surface-sunken flex min-h-20 items-center gap-3 rounded-md border-l-2 px-4 py-3',
            preview ? (isOutflow ? 'border-l-data-expense' : 'border-l-data-income') : 'border-l-edge',
          )}
          aria-live="polite"
        >
          {preview ? (
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-full',
                isOutflow ? 'bg-negative-wash text-data-expense' : 'bg-positive-wash text-data-income',
              )}
              aria-hidden
            >
              {isOutflow ? <ArrowUpRightIcon /> : <ArrowDownLeftIcon />}
            </span>
          ) : null}
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={preview ?? 'vazio'}
              variants={swapVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className={preview ? 'text-base text-text' : 'text-base text-text-3'}
            >
              {preview ?? 'Digite um valor para ver o que será criado.'}
            </motion.p>
          </AnimatePresence>
        </div>

        <Button type="submit" variant="primary" icon={<PlusIcon weight="bold" />} loading={create.isPending} disabled={!ready} className="self-start">
          Adicionar previsão
        </Button>
      </form>
    </Panel>
  )
}
