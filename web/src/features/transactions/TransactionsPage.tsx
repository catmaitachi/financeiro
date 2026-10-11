import { MagnifyingGlassIcon, ReceiptIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { keepPreviousData, useInfiniteQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useState } from 'react'
import { itemVariants, staggerVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatBRL, plural, todayIso } from '@/lib/format'
import { keys } from '@/lib/query'
import { Button, LinkButton } from '@/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/ui/Feedback'
import { Panel } from '@/ui/Panel'
import { BankFilter } from './BankFilter'
import { TransactionDrawer } from './TransactionDrawer'
import { TransactionFilterBar } from './TransactionFilterBar'
import { TransactionList } from './TransactionList'
import { useTransactionFilters } from './useTransactionFilters'

const PAGE_SIZE = 60

export default function TransactionsPage() {
  const { filters, update, clear, active } = useTransactionFilters()
  const [openId, setOpenId] = useState<string | null>(null)
  // Parcelas futuras têm data adiante e empurrariam o que aconteceu de verdade para baixo.
  const [future, setFuture] = useState(false)
  const hasPeriod = Boolean(filters.month || filters.from || filters.to)
  const effective = future || hasPeriod ? filters : { ...filters, to: todayIso() }

  const query = useInfiniteQuery({
    queryKey: keys.transactions(effective),
    queryFn: ({ pageParam }) => api.transactions.list({ ...effective, page: pageParam, pageSize: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.page * last.pageSize < last.total ? last.page + 1 : undefined),
    placeholderData: keepPreviousData,
  })

  const pages = query.data?.pages ?? []
  const transactions = pages.flatMap((page) => page.items)
  const summary = pages[0]
  // O painel lateral lê da lista atual, então mostra a correção assim que ela é salva.
  const open = transactions.find((transaction) => transaction.id === openId) ?? null

  return (
    <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col gap-6">
      <motion.header variants={itemVariants}>
        <h1 className="text-2xl text-text">Transações</h1>
        <p className="mt-1 min-h-5 text-base text-text-3">
          {summary
            ? `${plural(summary.total, 'lançamento', 'lançamentos')}, ${formatBRL(summary.totals.inCents)} em entradas e ${formatBRL(summary.totals.outCents)} em saídas`
            : null}
        </p>
      </motion.header>

      <div className="flex min-w-0 flex-col gap-6">
          <motion.div variants={itemVariants}>
            <BankFilter filters={filters} update={update} />
          </motion.div>
          <motion.div variants={itemVariants}>
            <TransactionFilterBar
              filters={filters}
              update={update}
              clear={clear}
              active={active}
              future={future || hasPeriod}
              futureLocked={hasPeriod}
              onFutureChange={setFuture}
            />
          </motion.div>

          <Panel padded={false} className={cn('p-3 transition-opacity duration-(--dur-state)', query.isPlaceholderData && 'opacity-60')}>
            {query.isPending ? (
              <div className="flex flex-col gap-3 p-3" aria-busy="true" aria-label="Carregando transações">
                {Array.from({ length: 8 }, (_, index) => (
                  <Skeleton key={index} className="h-12" />
                ))}
              </div>
            ) : query.isError ? (
              <Notice
                tone="negative"
                icon={<WarningCircleIcon size={20} />}
                title="Não foi possível carregar as transações"
                className="m-3 border-0 shadow-none"
                action={
                  <Button size="sm" onClick={() => void query.refetch()}>
                    Tentar de novo
                  </Button>
                }
              >
                {query.error.message}
              </Notice>
            ) : transactions.length === 0 ? (
              active > 0 ? (
                <EmptyState
                  icon={<MagnifyingGlassIcon size={22} />}
                  title="Nada encontrado com esses filtros"
                  action={<Button onClick={clear}>Limpar filtros</Button>}
                >
                  Tente outro período ou remova algum filtro.
                </EmptyState>
              ) : (
                <EmptyState
                  icon={<ReceiptIcon size={22} />}
                  title="Nenhuma transação ainda"
                  action={
                    <LinkButton variant="primary" to="/conexoes?conectar=1">
                      Conectar instituição
                    </LinkButton>
                  }
                >
                  Os lançamentos aparecem aqui depois da primeira sincronização.
                </EmptyState>
              )
            ) : (
              <>
                <TransactionList transactions={transactions} onOpen={(transaction) => setOpenId(transaction.id)} />
                {query.hasNextPage ? (
                  <div className="flex justify-center p-4">
                    <Button loading={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
                      Mostrar mais
                    </Button>
                  </div>
                ) : null}
              </>
            )}
          </Panel>
      </div>

      <TransactionDrawer transaction={open} onClose={() => setOpenId(null)} />
    </motion.div>
  )
}
