import { WarningCircleIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { Subscription } from '@shared/api'
import { itemVariants } from '@/design/motion'
import { formatBRL, formatDay, plural, todayIso } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Money } from '@/ui/Money'
import { Panel, PanelHeader } from '@/ui/Panel'
import { ServiceLogo } from './ServiceLogo'
import { SubscriptionDrawer } from './SubscriptionDrawer'
import { CADENCE, whereCharged } from './shared'

interface ListProps {
  subscriptions: Subscription[]
  /** Custo mensal das assinaturas ativas. */
  monthlyCents: number
  /** A assinatura com o detalhe aberto. */
  openId: number | null
  onOpen: (id: number | null) => void
}

/** As assinaturas confirmadas, com o custo mensal somado. Cada linha abre o detalhe. */
export function SubscriptionList({ subscriptions, monthlyCents, openId, onOpen }: ListProps) {
  // A gaveta acompanha os dados: depois de salvar, mostra a versão recarregada.
  const open = subscriptions.find((subscription) => subscription.id === openId) ?? null
  const today = todayIso()

  return (
    <Panel>
      <PanelHeader
        title="Ativas"
        description={
          subscriptions.length
            ? `${plural(subscriptions.length, 'assinatura confirmada', 'assinaturas confirmadas')}`
            : 'Nenhuma assinatura confirmada ainda. Confirme uma compra recorrente ou marque uma do extrato.'
        }
        action={
          subscriptions.length ? (
            <p className="text-right">
              <Money cents={monthlyCents} className="tabular text-md font-semibold text-text" />
              <span className="block text-sm text-text-3">por mês</span>
            </p>
          ) : undefined
        }
      />
      <ul className="flex flex-col">
        <AnimatePresence initial={false} mode="popLayout">
          {subscriptions.map((subscription) => {
            const where = whereCharged(subscription)
            return (
              <motion.li key={subscription.id} layout="position" variants={itemVariants} initial="initial" animate="enter" exit="exit">
                <button
                  type="button"
                  onClick={() => onOpen(subscription.id)}
                  className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-left transition-colors duration-200 hover:bg-fill-hover focus-visible:outline-2 focus-visible:outline-accent"
                >
                  <ServiceLogo name={subscription.name} domain={subscription.domain} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-text">{subscription.name}</span>
                    <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-3">
                      {subscription.stale ? (
                        <Badge tone="warning" icon={<WarningCircleIcon size={12} />}>
                          Sem cobrança recente
                        </Badge>
                      ) : (
                        <span>
                          {subscription.nextChargeDate < today ? 'Esperada desde' : 'Próxima em'} {formatDay(subscription.nextChargeDate)}
                        </span>
                      )}
                      {where ? <span className="truncate">{where}</span> : null}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="tabular block font-medium text-text">{formatBRL(subscription.amountCents)}</span>
                    <span className="block text-sm text-text-3">{CADENCE[subscription.cadence].per}</span>
                  </span>
                </button>
              </motion.li>
            )
          })}
        </AnimatePresence>
      </ul>
      <SubscriptionDrawer subscription={open} onClose={() => onOpen(null)} />
    </Panel>
  )
}
