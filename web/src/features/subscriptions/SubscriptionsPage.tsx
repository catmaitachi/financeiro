import { WarningCircleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import { itemVariants, staggerVariants } from '@/design/motion'
import { useSyncOnOpen } from '@/features/sync/useSync'
import { api } from '@/lib/api'
import { keys } from '@/lib/query'
import { Button } from '@/ui/Button'
import { Notice, Skeleton } from '@/ui/Feedback'
import { RecurringPurchases } from './RecurringPurchases'
import { SubscriptionList } from './SubscriptionList'

/** Assinaturas: as ativas, com o custo mensal, e as compras recorrentes que ainda podem virar uma. */
export default function SubscriptionsPage() {
  useSyncOnOpen()

  const [params, setParams] = useSearchParams()
  const openId = Number(params.get('assinatura')) || null
  const open = (id: number | null) => setParams(id === null ? {} : { assinatura: String(id) }, { replace: true })

  const subscriptions = useQuery({ queryKey: keys.subscriptions, queryFn: api.subscriptions.list })
  const all = subscriptions.data?.subscriptions ?? []
  const confirmed = all.filter((subscription) => subscription.status === 'confirmed')

  return (
    <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col gap-6">
      <motion.header variants={itemVariants}>
        <h1 className="text-2xl text-text">Assinaturas</h1>
        <p className="mt-1 text-base text-text-3">O que se repete no mesmo lugar, quanto custa e quando cai.</p>
      </motion.header>

      {subscriptions.isPending ? (
        <div className="grid items-start gap-6 lg:grid-cols-12" aria-busy="true" aria-label="Carregando as assinaturas">
          <Skeleton className="h-96 rounded-lg lg:col-span-7" />
          <Skeleton className="h-72 rounded-lg lg:col-span-5" />
        </div>
      ) : !subscriptions.data ? (
        <Notice
          tone="negative"
          icon={<WarningCircleIcon size={20} />}
          title="Não foi possível carregar as assinaturas"
          action={
            <Button size="sm" onClick={() => void subscriptions.refetch()}>
              Tentar de novo
            </Button>
          }
        >
          {subscriptions.error?.message}
        </Notice>
      ) : (
        <motion.div variants={itemVariants} className="grid items-start gap-6 lg:grid-cols-12">
          {/* No celular as recorrentes vêm antes: são o que pede uma decisão. */}
          <div className="min-w-0 lg:sticky lg:top-24 lg:col-span-5 lg:col-start-8 lg:row-start-1">
            <RecurringPurchases subscriptions={all} />
          </div>
          <div className="min-w-0 lg:col-span-7 lg:col-start-1 lg:row-start-1">
            <SubscriptionList subscriptions={confirmed} monthlyCents={subscriptions.data.monthlyCents} openId={openId} onOpen={open} />
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}
