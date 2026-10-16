import { CircleNotchIcon, LinkIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { SubscriptionChargeCandidate } from '@shared/api'
import { collapseVariants, swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatBRL, formatDate } from '@/lib/format'
import { keys } from '@/lib/query'
import { Badge } from '@/ui/Badge'
import { IconButton } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { useSubscriptionAction } from './shared'

/** Espera a pessoa parar de digitar antes de buscar. */
const DEBOUNCE_MS = 250

/** Busca no extrato uma saída que a detecção não reconheceu e a vincula à assinatura. */
export function ChargeSearch({ subscriptionId }: { subscriptionId: number }) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setSearch(text.trim()), DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [text])

  const results = useQuery({
    queryKey: keys.subscriptionCandidates(subscriptionId, search),
    queryFn: () => api.subscriptions.searchCharges(subscriptionId, search),
    enabled: search !== '',
    placeholderData: keepPreviousData,
  })
  const link = useSubscriptionAction(
    (transactionId: string) => api.subscriptions.linkCharge(subscriptionId, transactionId),
    'Cobrança vinculada.',
    () => {
      setText('')
      setSearch('')
    },
  )

  const open = search !== '' && text.trim() !== ''
  const items = results.data ?? []
  const refreshing = results.isFetching || text.trim() !== search

  return (
    <div className="mt-6">
      <TextField
        label="Vincular uma cobrança do extrato"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && text) {
            event.stopPropagation()
            setText('')
          }
        }}
        placeholder="Descrição, valor, data ou conta"
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
        hint="Por exemplo: netflix, 44,90, 12/09 ou nubank. Só saídas aparecem."
      />

      <AnimatePresence initial={false}>
        {open ? (
          <motion.div key="resultados" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <div className={cn('mt-3 transition-opacity duration-200', results.isPlaceholderData && 'opacity-60')} aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                {results.isError ? (
                  <motion.p key="erro" variants={swapVariants} initial="initial" animate="enter" exit="exit" className="text-sm text-negative">
                    Não foi possível buscar no extrato: {results.error.message}
                  </motion.p>
                ) : results.data && items.length === 0 ? (
                  <motion.p key="vazio" variants={swapVariants} initial="initial" animate="enter" exit="exit" className="text-sm text-text-3">
                    Nenhuma saída encontrada com “{search}”. Tente parte da descrição, o valor (44,90) ou a data (12/09).
                  </motion.p>
                ) : (
                  <motion.ul
                    key="lista"
                    variants={swapVariants}
                    initial="initial"
                    animate="enter"
                    exit="exit"
                    className="-mx-3 flex flex-col"
                    aria-label="Saídas encontradas"
                  >
                    {items.map((candidate) => (
                      <Candidate
                        key={candidate.transactionId}
                        candidate={candidate}
                        busy={link.isPending}
                        onLink={() => link.mutate(candidate.transactionId)}
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

function Candidate({ candidate, busy, onLink }: { candidate: SubscriptionChargeCandidate; busy: boolean; onLink: () => void }) {
  const where = `${candidate.bank.name}, ${candidate.accountLabel.toLowerCase()}`
  const content = (
    <>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-base text-text">{candidate.description}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-text-3">
          <span>{formatDate(candidate.date)}</span>
          <span className="truncate">{where}</span>
        </span>
      </span>
      <span className="tabular shrink-0 text-base text-text">{formatBRL(candidate.amountCents)}</span>
    </>
  )

  if (candidate.linkedTo) {
    return (
      <li className="flex items-center gap-3 px-3 py-2.5">
        {content}
        <Badge>Em {candidate.linkedTo.name}</Badge>
      </li>
    )
  }
  return (
    <li>
      <button
        type="button"
        disabled={busy}
        onClick={onLink}
        aria-label={`Vincular ${candidate.description}, ${formatDate(candidate.date)}, ${formatBRL(candidate.amountCents)}`}
        className="group flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left transition-colors duration-200 hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-60"
      >
        {content}
        <span className="flex size-8 shrink-0 items-center justify-center rounded-full text-text-3 transition-colors duration-200 group-hover:text-text">
          <LinkIcon size={16} />
        </span>
      </button>
    </li>
  )
}
