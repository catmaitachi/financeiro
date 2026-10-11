import { ArrowDownLeftIcon, ArrowUpRightIcon, PlusIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import { ForecastExpressionError, parseForecastExpression, type ForecastPlan } from '@shared/forecast-expression'
import { addMonths, type Month } from '@shared/months'
import { swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatBRL, formatMonth, formatMonthName } from '@/lib/format'
import { invalidateLedger } from '@/lib/query'
import { Button } from '@/ui/Button'
import { SelectField, TextField } from '@/ui/Field'
import { Panel, PanelHeader } from '@/ui/Panel'
import { useToast } from '@/ui/Toast'

/** O que a expressão vai criar, dito por extenso. */
function describe(plan: ForecastPlan, start: Month): string {
  const count = plan.amountsCents.length
  const first = plan.amountsCents[0]!
  const last = plan.amountsCents[count - 1]!
  const outflow = plan.totalCents < 0
  const kind = outflow ? 'saída' : 'entrada'
  const money = (cents: number) => formatBRL(Math.abs(cents))
  if (plan.recurring) return `Uma ${kind} de ${money(first)} todo mês, a partir de ${formatMonth(start).toLowerCase()}.`
  if (count === 1) return `Uma ${kind} de ${money(first)} em ${formatMonth(start).toLowerCase()}.`

  const range = `de ${formatMonthName(start)} a ${formatMonth(addMonths(start, count - 1)).toLowerCase()}`
  if (plan.mode === 'repeat') {
    return `${count} ${outflow ? 'saídas' : 'entradas'} de ${money(first)}, ${range}. Total de ${money(plan.totalCents)}.`
  }
  if (first === last) return `${money(plan.totalCents)} em ${count} meses de ${money(first)}, ${range}.`
  // Divisão com centavos de sobra: as primeiras parcelas levam um centavo a mais.
  const larger = plan.amountsCents.filter((amount) => amount === first).length
  return `${money(plan.totalCents)} em ${count} meses, ${range}: ${larger} de ${money(first)} e ${count - larger} de ${money(last)}.`
}

/** A gramática do campo Valor, um exemplo por linha. */
const EXAMPLES: [example: string, meaning: string][] = [
  ['300', 'Entrada de R$ 300 em um mês'],
  ['-300', 'Saída, com o sinal de menos'],
  ['300*3', 'Repete por 3 meses'],
  ['900/3', 'Divide em 3 meses'],
  ['300!', 'Repete todo mês, sem fim'],
]

interface ComposerProps {
  defaultStartMonth: Month
  currentMonth: Month
}

/** Cadastro de previsão com a gramática `300`, `300*3`, `900/3` e `300!`, com prévia enquanto digita. */
export function ForecastComposer({ defaultStartMonth, currentMonth }: ComposerProps) {
  const notify = useToast()
  const [expression, setExpression] = useState('')
  const [name, setName] = useState('')
  const [startMonth, setStartMonth] = useState<Month>(defaultStartMonth)
  useEffect(() => setStartMonth(defaultStartMonth), [defaultStartMonth])

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
    if (!parsed?.plan) return
    create.mutate({ expression, name: name.trim() || null, startMonth })
  }

  const months = useMemo(() => Array.from({ length: 25 }, (_, index) => addMonths(currentMonth, index - 6)), [currentMonth])
  const preview = parsed?.plan ? describe(parsed.plan, startMonth) : null
  const isOutflow = (parsed?.plan?.totalCents ?? 0) < 0

  return (
    <Panel>
      <PanelHeader title="Nova previsão" />
      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
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
              {EXAMPLES.map(([example, meaning]) => (
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
        <SelectField label="Primeiro mês" value={startMonth} onChange={(event) => setStartMonth(event.target.value)}>
          {months.map((month) => (
            <option key={month} value={month}>
              {formatMonth(month)}
            </option>
          ))}
        </SelectField>

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

        <Button type="submit" variant="primary" icon={<PlusIcon weight="bold" />} loading={create.isPending} disabled={!parsed?.plan} className="self-start">
          Adicionar previsão
        </Button>
      </form>
    </Panel>
  )
}
