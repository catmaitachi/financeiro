import { useMutation } from '@tanstack/react-query'
import type { Subscription, SubscriptionCadence } from '@shared/api'
import { api } from '@/lib/api'
import { plural } from '@/lib/format'
import { invalidateLedger } from '@/lib/query'
import { useToast } from '@/ui/Toast'

export const CADENCE: Record<SubscriptionCadence, { label: string; per: string }> = {
  weekly: { label: 'Semanal', per: 'por semana' },
  monthly: { label: 'Mensal', per: 'por mês' },
  yearly: { label: 'Anual', per: 'por ano' },
}

/** "Nubank, cartão final 0422" */
export function whereCharged(subscription: Subscription): string | null {
  if (!subscription.bank || !subscription.accountLabel) return null
  return `${subscription.bank.name}, ${subscription.accountLabel.toLowerCase()}`
}

/** Mutação de assinatura com o retorno padrão: recarrega os dados e avisa. */
export function useSubscriptionAction<T>(action: (input: T) => Promise<unknown>, done: string, onDone?: () => void) {
  const notify = useToast()
  return useMutation({
    mutationFn: action,
    onSuccess: () => {
      invalidateLedger()
      notify(done)
      onDone?.()
    },
    onError: (error) => notify(error.message, 'error'),
  })
}

/** Marca uma saída do extrato como assinatura. Entram junto as compras de mesmo valor no mesmo lugar. */
export function useMarkSubscription(onDone?: (subscription: Subscription) => void) {
  const notify = useToast()
  return useMutation({
    mutationFn: (transactionId: string) => api.subscriptions.mark(transactionId),
    onSuccess: (subscription) => {
      invalidateLedger()
      notify(`${subscription.name} é assinatura, com ${plural(subscription.charges.length, 'cobrança', 'cobranças')}.`)
      onDone?.(subscription)
    },
    onError: (error) => notify(error.message, 'error'),
  })
}

/** Onde cada transação é cobrança, entre as assinaturas sugeridas e confirmadas. */
export function chargeOwners(subscriptions: readonly Subscription[]): Map<string, Subscription> {
  const owners = new Map<string, Subscription>()
  for (const subscription of subscriptions) {
    for (const charge of subscription.charges) owners.set(charge.transactionId, subscription)
  }
  return owners
}

/** Link para a seção de assinaturas com o detalhe de uma delas aberto. */
export const subscriptionHref = (id: number) => `/assinaturas?assinatura=${id}`
