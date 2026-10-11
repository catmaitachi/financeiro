import { ArrowRightIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import type { TransactionQuery } from '@shared/api'
import { BankLogo } from '@/features/banks/BankLogo'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDay, formatMoney, todayIso } from '@/lib/format'
import { keys } from '@/lib/query'
import { LinkButton } from '@/ui/Button'
import { Skeleton } from '@/ui/Feedback'
import { Panel, PanelHeader } from '@/ui/Panel'

const VISIBLE = 7

/** As transações mais recentes, cada uma com o banco de onde veio, e o atalho para a lista completa. */
export function RecentPanel() {
  // Parcelas futuras de cartão têm data adiante: "recente" vai só até hoje.
  const recent: TransactionQuery = { to: todayIso(), page: 1, pageSize: VISIBLE }
  const query = useQuery({ queryKey: keys.transactions(recent), queryFn: () => api.transactions.list(recent) })
  const items = query.data?.items ?? []

  return (
    <Panel>
      <PanelHeader
        title="Últimas transações"
        action={
          <LinkButton size="sm" to="/transacoes" icon={<ArrowRightIcon />}>
            Ver todas
          </LinkButton>
        }
      />
      {query.isPending ? (
        <div className="flex flex-col gap-3" aria-busy="true" aria-label="Carregando transações">
          {Array.from({ length: 5 }, (_, index) => (
            <Skeleton key={index} className="h-11" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <p className="text-base text-text-3">Nada por aqui ainda. As transações chegam depois da primeira sincronização.</p>
      ) : (
        <ul className="-mx-3 flex flex-col">
          {items.map((transaction) => {
            const incoming = transaction.direction === 'in'
            return (
              <li key={transaction.id}>
                <Link
                  to={`/transacoes?banco=${transaction.bank.id}`}
                  className="flex items-center gap-3 rounded-md px-3 py-2.5 hover:bg-fill-hover"
                >
                  <BankLogo bank={transaction.bank} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{transaction.description}</span>
                    <span className="block truncate text-sm text-text-3">
                      {transaction.bank.name}, {formatDay(transaction.date)}
                      {transaction.time ? <span className="tabular">, {transaction.time}</span> : null}
                    </span>
                  </span>
                  <span className={cn('tabular text-md font-medium whitespace-nowrap', incoming ? 'text-positive' : 'text-negative')}>
                    {incoming ? '+' : '−'} {formatMoney(transaction.amountCents, transaction.currencyCode)}
                  </span>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
