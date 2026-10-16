import { CaretDownIcon, CheckIcon, PencilSimpleIcon, XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type FormEvent } from 'react'
import type { Subscription } from '@shared/api'
import { parseDomain } from '@shared/services'
import { collapseVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatBRL, formatDay, plural } from '@/lib/format'
import { Badge } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { Panel, PanelHeader } from '@/ui/Panel'
import { MarkSearch } from './MarkSearch'
import { ServiceLogo } from './ServiceLogo'
import { CADENCE, useSubscriptionAction, whereCharged } from './shared'

function Suggestion({ subscription }: { subscription: Subscription }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(subscription.name)
  const [site, setSite] = useState(subscription.domain ?? '')
  const siteInvalid = site.trim() !== '' && parseDomain(site) === null

  const confirm = useSubscriptionAction(
    () => api.subscriptions.confirm(subscription.id, { name: name.trim() || subscription.name, domain: site.trim() || null }),
    'Assinatura confirmada.',
  )
  const dismiss = useSubscriptionAction(() => api.subscriptions.dismiss(subscription.id), 'Sugestão dispensada.')
  const busy = confirm.isPending || dismiss.isPending
  const where = whereCharged(subscription)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (!siteInvalid) confirm.mutate(undefined)
  }

  return (
    <form onSubmit={submit} className="surface-sunken flex flex-col gap-3 rounded-md p-3" noValidate>
      <div className="flex flex-wrap items-center gap-3">
        <ServiceLogo name={name || subscription.name} domain={siteInvalid ? null : site.trim() ? parseDomain(site) : null} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-medium text-text">{name.trim() || subscription.name}</p>
          <p className="mt-0.5 text-sm text-text-3">
            {plural(subscription.charges.length, 'cobrança', 'cobranças')}, a última em {formatDay(subscription.lastChargeDate)}
            {where ? `. ${where}` : ''}
          </p>
        </div>
        <div className="text-right">
          <p className="tabular font-medium text-text">{formatBRL(subscription.amountCents)}</p>
          <Badge className="mt-1">{CADENCE[subscription.cadence].label}</Badge>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div key="editar" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <div className="grid gap-3 pt-1 sm:grid-cols-2">
              <TextField label="Nome" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} autoComplete="off" />
              <TextField
                label="Site (para o logotipo)"
                value={site}
                onChange={(event) => setSite(event.target.value)}
                placeholder="netflix.com"
                inputMode="url"
                autoComplete="off"
                spellCheck={false}
                error={siteInvalid ? 'Informe o site do serviço, como netflix.com.' : undefined}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" variant="primary" icon={<CheckIcon size={14} weight="bold" />} loading={confirm.isPending} disabled={busy || siteInvalid}>
          É assinatura
        </Button>
        <Button size="sm" icon={<XIcon size={14} weight="bold" />} loading={dismiss.isPending} disabled={busy} onClick={() => dismiss.mutate(undefined)}>
          Não é
        </Button>
        <Button size="sm" variant="ghost" icon={<PencilSimpleIcon size={14} />} aria-expanded={editing} onClick={() => setEditing((value) => !value)}>
          Ajustar nome e site
        </Button>
      </div>
    </form>
  )
}

/** Quantas sugestões aparecem antes de "ver as outras": a fila não pode esconder o resto da página. */
const PREVIEW = 3

/**
 * Compras recorrentes: o que a detecção achou e ainda espera o seu sim, e a
 * busca para marcar uma compra que ela não pegou.
 */
export function RecurringPurchases({ subscriptions }: { subscriptions: readonly Subscription[] }) {
  const [expanded, setExpanded] = useState(false)
  const suggestions = subscriptions.filter((subscription) => subscription.status === 'suggested')
  const shown = expanded ? suggestions : suggestions.slice(0, PREVIEW)
  const hidden = suggestions.length - shown.length
  return (
    <Panel>
      <PanelHeader
        title="Compras recorrentes"
        description={
          suggestions.length
            ? `${plural(suggestions.length, 'compra se repete', 'compras se repetem')} no mesmo lugar. Confirme as que são assinatura.`
            : 'Nada novo se repetindo agora. Quando uma compra voltar no mesmo lugar, com valor parecido, ela aparece aqui.'
        }
      />
      <ul className="flex flex-col gap-2">
        <AnimatePresence initial={false}>
          {shown.map((subscription) => (
            <motion.li
              key={subscription.id}
              layout="position"
              variants={collapseVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="overflow-hidden"
            >
              <Suggestion subscription={subscription} />
            </motion.li>
          ))}
        </AnimatePresence>
      </ul>
      {suggestions.length > PREVIEW ? (
        <Button
          size="sm"
          variant="ghost"
          className="mt-3"
          icon={<CaretDownIcon size={14} className={cn('transition-transform duration-(--dur-state)', expanded && 'rotate-180')} />}
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? 'Mostrar menos' : `Ver ${hidden === 1 ? 'a outra' : `as outras ${hidden}`}`}
        </Button>
      ) : null}
      <div className={suggestions.length ? 'mt-6 border-t border-edge pt-6' : undefined}>
        <MarkSearch subscriptions={subscriptions} />
      </div>
    </Panel>
  )
}
