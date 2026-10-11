import { CheckIcon, XIcon } from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import type { MatchReason, ReviewItem } from '@shared/api'
import { collapseVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { formatBRL, formatDay, formatMonth } from '@/lib/format'
import { invalidateLedger } from '@/lib/query'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Panel, PanelHeader } from '@/ui/Panel'
import { useToast } from '@/ui/Toast'

const REASON: Record<MatchReason, string> = {
  ambiguous: 'Mais de uma movimentação com este valor',
  out_of_month: 'Movimentação fora do mês esperado',
}

/**
 * Fila de revisão da conciliação: movimentações que o sistema não baixou
 * sozinho porque havia mais de uma leitura possível.
 */
export function ReviewQueue({ items }: { items: ReviewItem[] }) {
  const notify = useToast()
  const decide = useMutation({
    mutationFn: ({ matchId, accept }: { matchId: number; accept: boolean }) =>
      accept ? api.reconciliation.confirm(matchId) : api.reconciliation.reject(matchId),
    onSuccess: (_, { accept }) => {
      invalidateLedger()
      notify(accept ? 'Movimentação vinculada à previsão.' : 'Sugestão descartada.')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  return (
    <AnimatePresence initial={false}>
      {items.length ? (
        <motion.div key="queue" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
          <Panel>
            <PanelHeader
              title="Movimentações para conferir"
              description="O sistema só baixa sozinho quando há uma única previsão e uma única movimentação no mês."
            />
            <ul className="flex flex-col gap-6">
              <AnimatePresence initial={false}>
                {items.map(({ occurrence, candidates }) => (
                  <motion.li
                    key={occurrence.id}
                    layout="position"
                    variants={collapseVariants}
                    initial="initial"
                    animate="enter"
                    exit="exit"
                    className="overflow-hidden"
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                      <p className="font-medium text-text">
                        {occurrence.seriesName ?? 'Previsão sem nome'}
                        <span className="font-normal text-text-3">, {formatMonth(occurrence.month).toLowerCase()}</span>
                      </p>
                      <p className="tabular font-medium text-text">{formatBRL(occurrence.amountCents)}</p>
                    </div>
                    <ul className="mt-3 flex flex-col gap-2">
                      <AnimatePresence initial={false}>
                        {candidates.map((candidate) => (
                          <motion.li
                            key={candidate.matchId}
                            layout="position"
                            variants={collapseVariants}
                            initial="initial"
                            animate="enter"
                            exit="exit"
                            className="overflow-hidden"
                          >
                            <div className="surface-sunken flex flex-wrap items-center justify-between gap-3 rounded-md p-3">
                              <div className="min-w-0">
                                <p className="truncate text-base text-text">{candidate.transaction.description}</p>
                                <p className="mt-0.5 text-sm text-text-3">
                                  {formatDay(candidate.transaction.date)}, {candidate.transaction.accountName} (
                                  {candidate.transaction.institution})
                                </p>
                                <Badge tone="accent" className="mt-2">
                                  {REASON[candidate.reason]}
                                </Badge>
                              </div>
                              <div className="flex shrink-0 gap-2">
                                <Button
                                  size="sm"
                                  variant="primary"
                                  icon={<CheckIcon size={14} weight="bold" />}
                                  disabled={decide.isPending}
                                  onClick={() => decide.mutate({ matchId: candidate.matchId, accept: true })}
                                >
                                  É este
                                </Button>
                                <Button
                                  size="sm"
                                  icon={<XIcon size={14} weight="bold" />}
                                  disabled={decide.isPending}
                                  onClick={() => decide.mutate({ matchId: candidate.matchId, accept: false })}
                                >
                                  Não é
                                </Button>
                              </div>
                            </div>
                          </motion.li>
                        ))}
                      </AnimatePresence>
                    </ul>
                  </motion.li>
                ))}
              </AnimatePresence>
            </ul>
          </Panel>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
