import { CalendarCheckIcon, CheckCircleIcon, ClockIcon, HourglassMediumIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { motion } from 'motion/react'
import { Link } from 'react-router'
import type { BankBill, BankSummary, Dashboard } from '@shared/api'
import type { Month } from '@shared/months'
import { duration, ease } from '@/design/motion'
import { BankLogo } from '@/features/banks/BankLogo'
import type { BankTones } from '@/features/banks/tones'
import { cn } from '@/lib/cn'
import { formatBRL, formatDay, formatMonthName, plural } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Money } from '@/ui/Money'
import { Panel } from '@/ui/Panel'

const DAY_MS = 86_400_000

/** Dias de hoje até a data, pelo calendário local. */
function daysUntil(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const today = new Date()
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(today.getFullYear(), today.getMonth(), today.getDate())) / DAY_MS)
}

function deadline(date: string): string {
  const days = daysUntil(date)
  if (days < 0) return `Venceu em ${formatDay(date)}`
  if (days === 0) return 'Vence hoje'
  if (days === 1) return 'Vence amanhã'
  return `Vence em ${formatDay(date)}, em ${plural(days, 'dia', 'dias')}`
}

/** O estado da fatura, sempre com ícone e texto: a cor só reforça. */
function Status({ bill }: { bill: BankBill }) {
  if (bill.status === 'paid') {
    return (
      <Badge tone="positive" icon={<CheckCircleIcon size={12} weight="fill" />}>
        {bill.paidOn ? `Paga em ${formatDay(bill.paidOn)}` : 'Paga'}
      </Badge>
    )
  }
  if (bill.status === 'closed') {
    return (
      <Badge tone="warning" icon={<ClockIcon size={12} weight="bold" />}>
        {bill.dueDate ? deadline(bill.dueDate) : 'A pagar'}
      </Badge>
    )
  }
  return (
    <Badge icon={<HourglassMediumIcon size={12} />}>
      {bill.dueDate ? `Em aberto, vence por volta de ${formatDay(bill.dueDate)}` : 'Em aberto'}
    </Badge>
  )
}

interface BankBillsProps {
  month: Month
  banks: BankSummary[]
  tones: BankTones
  /** Previsões em aberto da competência exibida. */
  forecasts: Dashboard['forecasts']
  forecastMonth: Month
}

/** O que a previsão diz sobre as faturas que faltam pagar. */
function Verdict({ unpaid, net, hasForecast, forecastMonth }: { unpaid: number; net: number; hasForecast: boolean; forecastMonth: Month }) {
  if (!hasForecast) {
    return (
      <Link to="/previsoes" className="inline-flex items-center gap-1 text-sm font-medium text-accent-strong hover:underline">
        <CalendarCheckIcon size={14} />
        Cadastrar previsões de {formatMonthName(forecastMonth)}
      </Link>
    )
  }
  if (unpaid === 0) {
    return (
      <Badge tone="positive" icon={<CheckCircleIcon size={12} weight="fill" />}>
        Faturas pagas
      </Badge>
    )
  }
  const margin = net - unpaid
  return margin >= 0 ? (
    <Badge tone="positive" icon={<CheckCircleIcon size={12} weight="fill" />}>
      A previsão cobre, sobram {formatBRL(margin)}
    </Badge>
  ) : (
    <Badge tone="warning" icon={<WarningCircleIcon size={12} weight="fill" />}>
      Faltam {formatBRL(-margin)} para cobrir
    </Badge>
  )
}

/**
 * O primeiro bloco do Painel: as faturas do mês de todos os bancos e o que a
 * previsão do mês diz sobre elas. Um trilho mostra o que falta pagar, dividido
 * por banco, e onde termina a previsão líquida (entradas menos saídas em
 * aberto); abaixo, uma linha por banco com o valor e se já foi paga.
 */
export function BankBills({ month, banks, tones, forecasts, forecastMonth }: BankBillsProps) {
  const billed = banks.filter((entry) => entry.bill !== null)
  const total = billed.reduce((sum, entry) => sum + entry.bill!.amountCents, 0)
  const unpaid = billed.filter((entry) => entry.bill!.status !== 'paid')
  const unpaidCents = unpaid.reduce((sum, entry) => sum + entry.bill!.amountCents, 0)

  const hasForecast = forecasts.openCount > 0
  const net = forecasts.openInCents - forecasts.openOutCents
  // O trilho cabe o maior dos dois: o que falta pagar ou o que a previsão deixa disponível.
  const scale = Math.max(unpaidCents, net, 1)
  const markerAt = hasForecast && net > 0 ? (net / scale) * 100 : null

  return (
    <Panel className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-x-12 gap-y-6">
        <div>
          <h1 className="font-sans text-sm font-medium tracking-normal text-text-3">Faturas de {formatMonthName(month)}</h1>
          <Money cents={total} className="mt-1 block text-2xl font-semibold tracking-tight text-data-expense md:text-hero" />
          {billed.length ? (
            <p className="mt-1 text-md text-text-2">
              {unpaidCents > 0 ? (
                <>
                  Falta pagar <strong className="font-semibold text-text">{formatBRL(unpaidCents)}</strong>
                  {unpaid.length === 1 ? `, no ${unpaid[0]!.bank.name}` : `, em ${unpaid.length} bancos`}
                </>
              ) : (
                'Tudo pago neste mês'
              )}
            </p>
          ) : null}
        </div>

        <div className="min-w-60 md:ml-auto md:text-right">
          <h2 className="font-sans text-sm font-medium tracking-normal text-text-3">Previsão de {formatMonthName(forecastMonth)}</h2>
          {hasForecast ? (
            <>
              <Money cents={net} className={cn('mt-1 block text-xl font-semibold', net < 0 ? 'text-negative' : 'text-positive')} />
              <p className="mt-1 text-sm text-text-3">
                Entradas {formatBRL(forecasts.openInCents)}, saídas {formatBRL(forecasts.openOutCents)}
              </p>
            </>
          ) : (
            <p className="mt-1 text-base text-text-3">Nenhuma previsão em aberto</p>
          )}
          <div className="mt-2">
            <Verdict unpaid={unpaidCents} net={net} hasForecast={hasForecast} forecastMonth={forecastMonth} />
          </div>
        </div>
      </div>

      {billed.length === 0 ? (
        <p className="text-base text-text-3">Nenhum cartão com fatura por enquanto.</p>
      ) : (
        <>
          {/* O trilho: o que falta pagar, por banco, contra o ponto onde a previsão líquida termina. */}
          {unpaidCents > 0 && markerAt !== null ? (
            <div className="relative pt-6" aria-hidden="true">
              <div className="surface-sunken relative h-4 rounded-[4px]">
                <div className="flex h-full gap-0.5" style={{ width: `${(unpaidCents / scale) * 100}%` }}>
                  {unpaid.map((entry, index) => (
                    <motion.span
                      key={entry.bank.id}
                      className={cn('origin-left rounded-r-[4px]', tones(entry.bank.id))}
                      style={{ flexGrow: entry.bill!.amountCents, flexBasis: 0 }}
                      initial={{ scaleX: 0 }}
                      animate={{ scaleX: 1 }}
                      transition={{ duration: duration.entrance, ease: ease.out, delay: index * 0.06 }}
                    />
                  ))}
                </div>
                {markerAt !== null ? (
                  <motion.span
                    className="absolute -top-1.5 -bottom-1.5 w-0.5 rounded-full bg-text"
                    style={{ left: `${markerAt}%` }}
                    initial={{ opacity: 0, scaleY: 0.4 }}
                    animate={{ opacity: 1, scaleY: 1 }}
                    transition={{ duration: duration.layout, ease: ease.out, delay: 0.2 }}
                  />
                ) : null}
              </div>
              {markerAt !== null ? (
                <span
                  className={cn('absolute top-0 text-xs font-medium whitespace-nowrap text-text-2', markerAt > 55 ? '-translate-x-full pr-2' : 'pl-2')}
                  style={{ left: `${markerAt}%` }}
                >
                  Previsão {formatBRL(net)}
                </span>
              ) : null}
            </div>
          ) : null}

          <ul className="-mx-3 flex flex-col gap-1">
            {billed.map((entry) => {
              const bill = entry.bill!
              const due = bill.status !== 'paid'
              return (
                <li key={entry.bank.id} className="min-w-0">
                  <Link
                    to={`/transacoes?banco=${entry.bank.id}&mes=${bill.month}&origem=cartao`}
                    className={cn(
                      'grid grid-cols-[auto_1fr_auto] items-center gap-x-4 gap-y-1 rounded-md p-3 hover:bg-fill-hover',
                      due && 'bg-accent-wash hover:bg-accent-wash',
                    )}
                  >
                    <BankLogo bank={entry.bank} size="lg" className="sm:row-span-2" />
                    <span className="truncate text-md font-medium text-text">{entry.bank.name}</span>
                    <Money cents={bill.amountCents} className={cn('tabular text-xl font-semibold sm:row-span-2', due ? 'text-text' : 'text-text-2')} />
                    <span className="col-span-3 mt-1 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 sm:col-span-1 sm:mt-0">
                      <Status bill={bill} />
                      {bill.estimated && bill.status === 'closed' ? (
                        <span className="text-sm text-text-3">Valor estimado: o banco ainda não enviou a fatura fechada.</span>
                      ) : null}
                      {entry.next ? (
                        <span className="text-sm text-text-3">
                          {formatMonthName(entry.next.month).replace(/^./, (letter) => letter.toUpperCase())}, em aberto:{' '}
                          <span className="tabular text-text-2">{formatBRL(entry.next.amountCents)}</span>
                        </span>
                      ) : null}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </Panel>
  )
}
