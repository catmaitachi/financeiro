import {
  CalendarXIcon,
  CaretRightIcon,
  CreditCardIcon,
  CurrencyDollarIcon,
  HourglassMediumIcon,
  LinkBreakIcon,
  ScalesIcon,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import { Link } from 'react-router'
import type { Dashboard } from '@shared/api'
import { itemVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { formatBRL, formatMoney, plural } from '@/lib/format'
import { keys } from '@/lib/query'
import { Panel } from '@/ui/Panel'

interface Entry {
  key: string
  icon: ReactNode
  title: string
  detail: string
  value?: string
  to: string
}

function entriesFor(dashboard: Dashboard, troubled: { id: string; name: string; title: string }[]): Entry[] {
  const entries: Entry[] = []

  for (const connection of troubled) {
    entries.push({
      key: `connection-${connection.id}`,
      icon: <LinkBreakIcon className="text-negative" />,
      title: connection.name,
      detail: connection.title,
      to: '/conexoes',
    })
  }
  if (dashboard.reviewCount > 0) {
    entries.push({
      key: 'review',
      icon: <ScalesIcon className="text-accent" />,
      title: 'Movimentações para conferir',
      detail: `${plural(dashboard.reviewCount, 'previsão tem', 'previsões têm')} mais de um candidato ou ocorreu fora do mês`,
      to: '/previsoes',
    })
  }
  if (dashboard.forecasts.overdueCount > 0) {
    entries.push({
      key: 'overdue',
      icon: <CalendarXIcon className="text-warning" />,
      title: 'Previsões atrasadas',
      detail: `${plural(dashboard.forecasts.overdueCount, 'movimentação esperada', 'movimentações esperadas')} em meses anteriores ainda está em aberto`,
      to: '/previsoes',
    })
  }
  if (dashboard.pending.count > 0) {
    const net = dashboard.pending.inCents - dashboard.pending.outCents
    entries.push({
      key: 'pending',
      icon: <HourglassMediumIcon className="text-text-2" />,
      title: 'Lançamentos pendentes',
      detail: `${plural(dashboard.pending.count, 'lançamento fica', 'lançamentos ficam')} fora dos totais até a confirmação`,
      value: `${net >= 0 ? '+' : '−'} ${formatBRL(Math.abs(net))}`,
      to: `/transacoes?mes=${dashboard.month}&status=PENDING`,
    })
  }
  if (dashboard.unidentifiedBill.count > 0) {
    entries.push({
      key: 'unidentified',
      icon: <CreditCardIcon className="text-warning" />,
      title: 'Fatura não identificada',
      detail: `${plural(dashboard.unidentifiedBill.count, 'compra de cartão', 'compras de cartão')} sem mês de fatura informado pelo banco`,
      value: formatBRL(dashboard.unidentifiedBill.cents),
      to: '/transacoes?fatura=nao-identificada',
    })
  }
  for (const currency of dashboard.otherCurrencies) {
    entries.push({
      key: `currency-${currency.currencyCode}`,
      icon: <CurrencyDollarIcon className="text-text-2" />,
      title: `Lançamentos em ${currency.currencyCode}`,
      detail: `${plural(currency.count, 'lançamento', 'lançamentos')} em outra moeda, fora dos totais em reais`,
      value: formatMoney(currency.outCents - currency.inCents, currency.currencyCode),
      to: `/transacoes?mes=${dashboard.month}`,
    })
  }
  return entries
}

/** O que precisa de uma decisão ou ficou de fora dos totais, com o caminho para resolver. Some quando não há nada. */
export function AttentionList({ dashboard }: { dashboard: Dashboard }) {
  const connections = useQuery({ queryKey: keys.connections, queryFn: api.connections.list })
  const troubled = (connections.data ?? [])
    .filter((connection) => connection.health.level === 'error' || connection.health.level === 'attention')
    .map((connection) => ({ id: connection.id, name: connection.institution.name, title: connection.health.title }))
  const entries = entriesFor(dashboard, troubled)

  // Sem pendências, o bloco não ocupa espaço: o Painel fica só com o que se veio conferir.
  if (entries.length === 0) return null

  return (
    <Panel className="flex flex-col">
      <h2 className="mb-2 text-lg text-text">Pede sua atenção</h2>
      <ul className="-mx-3 flex flex-col">
          <AnimatePresence initial={false}>
            {entries.map((entry) => (
              <motion.li key={entry.key} layout variants={itemVariants} initial="initial" animate="enter" exit="exit">
                <Link
                  to={entry.to}
                  className="group flex items-center gap-3 rounded-md px-3 py-3 hover:bg-fill-hover"
                >
                  <span className="surface-sunken flex size-9 shrink-0 items-center justify-center rounded-full">{entry.icon}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-text">{entry.title}</span>
                    <span className="block text-sm text-text-3">{entry.detail}</span>
                  </span>
                  {entry.value ? <span className="tabular shrink-0 font-medium text-text-2">{entry.value}</span> : null}
                  <CaretRightIcon size={16} className="shrink-0 text-text-3 group-hover:translate-x-0.5 group-hover:text-text" />
                </Link>
              </motion.li>
            ))}
          </AnimatePresence>
      </ul>
    </Panel>
  )
}
