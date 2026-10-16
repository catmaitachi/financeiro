import { ArrowsClockwiseIcon, CircleNotchIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { Subscription, TransactionRow } from '@shared/api'
import { collapseVariants, swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatBRL, formatDate, todayIso } from '@/lib/format'
import { keys } from '@/lib/query'
import { Badge } from '@/ui/Badge'
import { IconButton } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { chargeOwners, useMarkSubscription } from './shared'
import { canBeSubscription } from './TransactionSubscription'

/** Espera a pessoa parar de digitar antes de buscar. */
const DEBOUNCE_MS = 250
const RESULTS = 8

/** Busca no extrato uma compra que a detecção não pegou e a marca como assinatura. */
export function MarkSearch({ subscriptions }: { subscriptions: readonly Subscription[] }) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const query = { q: search, direction: 'out' as const, to: todayIso(), pageSize: RESULTS * 2 }
  const results = useQuery({
    queryKey: keys.transactions(query),
    queryFn: () => api.transactions.list(query),
    enabled: search !== '',
    placeholderData: keepPreviousData,
  })
  const mark = useMarkSubscription(() => {
    setText('')
    setSearch('')
  })

  const owners = chargeOwners(subscriptions)
  const open = search !== '' && text.trim() !== ''
  const items = (results.data?.items ?? []).filter(canBeSubscription).slice(0, RESULTS)
  const refreshing = results.isFetching || text.trim() !== search

  return (
    <div>
      <TextField
        label="Marcar uma compra do extrato"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && text) {
            event.stopPropagation()
            setText('')
          }
        }}
        placeholder="Descrição, valor ou data"
        type="search"
        autoComplete="off"
        spellCheck={false}
        maxLength={120}
        leading={<MagnifyingGlassIcon size={18} />}
        trailing={
          text ? (
            <IconButton label="Limpar a busca" size="sm" onClick={() => setText('')}>
              {refreshing && open ? <CircleNotchIcon size={16} className="animate-spin" /> : <XIcon size={16} />}
            </IconButton>
          ) : undefined
        }
        hint="Entram junto as compras de mesmo valor no mesmo lugar."
      />

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div key="resultados" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <div className={cn('mt-3 transition-opacity duration-(--dur-state)', results.isPlaceholderData && 'opacity-60')} aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {results.isError ? (
                  <motion.p key="erro" variants={swapVariants} initial="initial" animate="enter" exit="exit" className="text-sm text-negative">
                    Não foi possível buscar no extrato: {results.error.message}
                  </motion.p>
                ) : results.data && items.length === 0 ? (
                  <motion.p key="vazio" variants={swapVariants} initial="initial" animate="enter" exit="exit" className="text-sm text-text-3">
                    Nenhuma compra à vista encontrada com “{search}”. Tente parte da descrição, o valor (29,90) ou a data (05/09).
                  </motion.p>
                ) : (
                  <motion.ul
                    key="lista"
                    variants={swapVariants}
                    initial="initial"
                    animate="enter"
                    exit="exit"
                    className="-mx-3 flex flex-col"
                    aria-label="Compras encontradas"
                  >
                    {items.map((item) => (
                      <Result
                        key={item.id}
                        transaction={item}
                        owner={owners.get(item.id) ?? null}
                        busy={mark.isPending}
                        onMark={() => mark.mutate(item.id)}
                      />
                    ))}
                  </motion.ul>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

interface ResultProps {
  transaction: TransactionRow
  owner: Subscription | null
  busy: boolean
  onMark: () => void
}

function Result({ transaction, owner, busy, onMark }: ResultProps) {
  const content = (
    <span className="min-w-0 flex-1">
      <span className="flex items-baseline justify-between gap-3">
        <span className="truncate text-base text-text">{transaction.description}</span>
        <span className="tabular shrink-0 text-base text-text">{formatBRL(transaction.amountCents)}</span>
      </span>
      <span className="mt-0.5 flex items-center justify-between gap-3 text-sm text-text-3">
        <span className="truncate">
          {formatDate(transaction.date)}, {transaction.bank.name}
        </span>
        {owner ? <Badge className="shrink-0">Em {owner.name}</Badge> : null}
      </span>
    </span>
  )

  // Já em uma assinatura confirmada: não há o que marcar. A sugerida ainda pode ser confirmada por aqui.
  if (owner?.status === 'confirmed') return <li className="flex items-center gap-3 px-3 py-2.5">{content}</li>
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={onMark}
        aria-label={`Marcar como assinatura: ${transaction.description}, ${formatDate(transaction.date)}, ${formatBRL(transaction.amountCents)}`}
        className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-(--dur-state) hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {content}
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors duration-(--dur-state) group-hover:text-text">
          <ArrowsClockwiseIcon size={16} />
        </span>
      </button>
    </li>
  )
}
