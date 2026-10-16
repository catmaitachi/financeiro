import type { Subscription, SubscriptionCadence } from '@shared/api'
import { api } from '@/lib/api'
import { Segmented } from '@/ui/Segmented'
import { CADENCE, useSubscriptionAction } from './shared'

const OPTIONS = (['weekly', 'monthly', 'yearly'] as const).map((value) => ({ value, label: CADENCE[value].label }))

/** Troca a frequência da assinatura na hora. A próxima data passa a seguir a escolha. */
export function CadencePicker({ subscription, size = 'md' }: { subscription: Subscription; size?: 'sm' | 'md' }) {
  const save = useSubscriptionAction(
    (cadence: SubscriptionCadence) => api.subscriptions.update(subscription.id, { cadence }),
    'Frequência atualizada.',
  )
  return (
    <Segmented
      label={`Frequência de ${subscription.name}`}
      options={OPTIONS}
      value={save.isPending && save.variables ? save.variables : subscription.cadence}
      onChange={(cadence) => {
        if (cadence !== subscription.cadence) save.mutate(cadence)
      }}
      size={size}
    />
  )
}
