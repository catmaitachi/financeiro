import { ArrowRightIcon, ArrowsClockwiseIcon, CheckIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import type { Subscription, TransactionRow } from '@shared/api'
import { swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { formatBRL } from '@/lib/format'
import { keys } from '@/lib/query'
import { Badge } from '@/ui/Badge'
import { Button, LinkButton } from '@/ui/Button'
import { CadencePicker } from './CadencePicker'
import { ServiceLogo } from './ServiceLogo'
import { CADENCE, chargeOwners, subscriptionHref, useMarkSubscription } from './shared'

/** Só uma saída à vista, em reais, de compra comum pode virar assinatura. */
export function canBeSubscription(transaction: TransactionRow): boolean {
  return (
    transaction.direction === 'out' &&
    transaction.kind === 'regular' &&
    transaction.installment === null &&
    transaction.currencyCode === 'BRL'
  )
}

/**
 * O bloco de assinatura no detalhe de uma transação: diz em qual assinatura ela
 * está ou oferece marcá-la como uma, levando junto as compras gêmeas.
 */
export function TransactionSubscription({ transaction }: { transaction: TransactionRow }) {
  const subscriptions = useQuery({ queryKey: keys.subscriptions, queryFn: api.subscriptions.list })
  const mark = useMarkSubscription()

  if (!subscriptions.data || !canBeSubscription(transaction)) return null
  const owner = chargeOwners(subscriptions.data.subscriptions).get(transaction.id) ?? null
  const merchant = transaction.merchantName ?? transaction.description
  const state = owner ? owner.status : 'free'

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm font-medium text-text-2">Assinatura</p>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={state} variants={swapVariants} initial="initial" animate="enter" exit="exit" className="flex flex-col gap-3">
          {owner ? (
            <>
              <Owner subscription={owner}>
                {owner.status === 'confirmed' ? (
                  <LinkButton size="sm" variant="ghost" to={subscriptionHref(owner.id)} icon={<ArrowRightIcon size={14} />}>
                    Abrir
                  </LinkButton>
                ) : (
                  <Button
                    size="sm"
                    variant="primary"
                    icon={<CheckIcon size={14} weight="bold" />}
                    loading={mark.isPending}
                    onClick={() => mark.mutate(transaction.id)}
                  >
                    É assinatura
                  </Button>
                )}
              </Owner>
              {owner.status === 'confirmed' ? <CadencePicker subscription={owner} size="sm" /> : null}
              <p className="text-sm text-text-3">
                {owner.status === 'confirmed'
                  ? 'As próximas cobranças de valor parecido entram sozinhas, a cada sincronização. Se ela vem uma vez por ano, troque para anual.'
                  : 'Encontrada pela repetição no mesmo lugar. Confirme para ela entrar no calendário e no custo mensal.'}
              </p>
            </>
          ) : (
            <>
              <Button
                className="self-start"
                icon={<ArrowsClockwiseIcon size={16} />}
                loading={mark.isPending}
                onClick={() => mark.mutate(transaction.id)}
              >
                Marcar como assinatura
              </Button>
              <p className="text-sm text-text-3">
                Entram junto as outras compras de {formatBRL(transaction.amountCents)} em {merchant}, e as próximas que vierem.
              </p>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </section>
  )
}

function Owner({ subscription, children }: { subscription: Subscription; children: React.ReactNode }) {
  return (
    <div className="surface-sunken flex items-center gap-3 rounded-md p-3">
      <ServiceLogo name={subscription.name} domain={subscription.domain} />
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-2">
          <span className="truncate font-medium text-text">{subscription.name}</span>
          {subscription.status === 'suggested' ? <Badge>Sugestão</Badge> : null}
        </p>
        <p className="mt-0.5 text-sm text-text-3">
          {CADENCE[subscription.cadence].label}, {formatBRL(subscription.amountCents)} {CADENCE[subscription.cadence].per}
        </p>
      </div>
      {children}
    </div>
  )
}
