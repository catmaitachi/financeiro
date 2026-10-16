import { LinkBreakIcon, ProhibitIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState, type FormEvent } from 'react'
import type { Subscription } from '@shared/api'
import { parseDomain } from '@shared/services'
import { collapseVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { formatBRL, formatDate, formatDay, todayIso } from '@/lib/format'
import { Button, IconButton } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Badge } from '@/ui/Badge'
import { Drawer } from '@/ui/Overlay'
import { CadencePicker } from './CadencePicker'
import { ChargeSearch } from './ChargeSearch'
import { ServiceLogo } from './ServiceLogo'
import { CADENCE, useSubscriptionAction, whereCharged } from './shared'

interface DrawerProps {
  subscription: Subscription | null
  onClose: () => void
}

/** Detalhe de uma assinatura confirmada: frequência, nome, site, cobranças vinculadas (e a busca para vincular outra) e encerramento. */
export function SubscriptionDrawer({ subscription, onClose }: DrawerProps) {
  // Mantém a última assinatura aberta enquanto a gaveta se fecha, para o conteúdo não sumir antes dela.
  const [shown, setShown] = useState(subscription)
  useEffect(() => {
    if (subscription) setShown(subscription)
  }, [subscription])

  return (
    <Drawer
      open={subscription !== null}
      onClose={onClose}
      title={shown?.name ?? ''}
      description={shown ? `${CADENCE[shown.cadence].label}, ${formatBRL(shown.amountCents)} ${CADENCE[shown.cadence].per}` : undefined}
    >
      {shown ? <Details key={shown.id} subscription={shown} onClose={onClose} /> : null}
    </Drawer>
  )
}

function Details({ subscription, onClose }: { subscription: Subscription; onClose: () => void }) {
  const [name, setName] = useState(subscription.name)
  const [site, setSite] = useState(subscription.domain ?? '')
  const siteInvalid = site.trim() !== '' && parseDomain(site) === null
  const changed = name.trim() !== subscription.name || (parseDomain(site) ?? null) !== subscription.domain

  const save = useSubscriptionAction(
    () => api.subscriptions.update(subscription.id, { name: name.trim(), domain: site.trim() || null }),
    'Assinatura atualizada.',
  )
  const end = useSubscriptionAction(() => api.subscriptions.end(subscription.id), 'Assinatura encerrada.', onClose)
  const unlink = useSubscriptionAction(
    (transactionId: string) => api.subscriptions.unlinkCharge(subscription.id, transactionId),
    'Cobrança desvinculada.',
  )
  const where = whereCharged(subscription)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (name.trim() && !siteInvalid && changed) save.mutate(undefined)
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-center gap-3">
        <ServiceLogo name={subscription.name} domain={subscription.domain} size="lg" />
        <div className="min-w-0">
          <p className="tabular text-xl font-semibold text-text">{formatBRL(subscription.amountCents)}</p>
          <p className="mt-1 text-sm text-text-3">
            {subscription.stale
              ? `Sem cobrança desde ${formatDate(subscription.lastChargeDate)}`
              : subscription.nextChargeDate < todayIso()
                ? `A cobrança de ${formatDay(subscription.nextChargeDate)} ainda não chegou`
                : `Próxima cobrança esperada em ${formatDay(subscription.nextChargeDate)}`}
            {where ? `. ${where}` : ''}
          </p>
        </div>
      </div>

      <section className="flex flex-col gap-3">
        <p className="text-sm font-medium text-text-2">Frequência</p>
        <CadencePicker subscription={subscription} />
      </section>

      <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
        <TextField
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          autoComplete="off"
          error={name.trim() ? undefined : 'Informe o nome da assinatura.'}
        />
        <TextField
          label="Site (para o logotipo)"
          value={site}
          onChange={(event) => setSite(event.target.value)}
          placeholder="netflix.com"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          error={siteInvalid ? 'Informe o site do serviço, como netflix.com.' : undefined}
          hint="O logotipo é buscado na internet a partir deste endereço."
        />
        <AnimatePresence initial={false}>
          {changed ? (
            <motion.div key="salvar" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
              <Button type="submit" variant="primary" size="sm" loading={save.isPending} disabled={!name.trim() || siteInvalid}>
                Salvar
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </form>

      <section>
        <h3 className="font-sans text-base font-semibold tracking-normal text-text-2">Cobranças vinculadas</h3>
        <ul className="mt-2 divide-y divide-edge border-y border-edge">
          <AnimatePresence initial={false}>
            {subscription.charges.map((charge) => (
              <motion.li
                key={charge.transactionId}
                variants={collapseVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="overflow-hidden"
              >
                <div className="flex items-center gap-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-base text-text">{charge.description}</p>
                    <p className="flex items-center gap-2 text-sm text-text-3">
                      {formatDate(charge.date)}
                      {charge.manual ? <Badge>Vinculada à mão</Badge> : null}
                    </p>
                  </div>
                  <p className="tabular shrink-0 text-base text-text">{formatBRL(charge.amountCents)}</p>
                  {subscription.charges.length > 1 ? (
                    <IconButton
                      label={`Desvincular a cobrança de ${formatDate(charge.date)}`}
                      size="sm"
                      disabled={unlink.isPending}
                      onClick={() => unlink.mutate(charge.transactionId)}
                    >
                      <LinkBreakIcon size={16} />
                    </IconButton>
                  ) : null}
                </div>
              </motion.li>
            ))}
          </AnimatePresence>
        </ul>
        <ChargeSearch subscriptionId={subscription.id} />
      </section>

      <div>
        <Button variant="danger" icon={<ProhibitIcon />} loading={end.isPending} onClick={() => end.mutate(undefined)}>
          Encerrar assinatura
        </Button>
        <p className="mt-2 text-sm text-text-3">Ela sai do calendário. As transações continuam onde estão.</p>
      </div>
    </div>
  )
}
