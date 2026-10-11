import {
  ArrowsClockwiseIcon,
  BankIcon,
  CheckCircleIcon,
  CircleNotchIcon,
  CreditCardIcon,
  KeyIcon,
  PlugsIcon,
  TrashIcon,
  WarningCircleIcon,
  WarningIcon,
} from '@phosphor-icons/react'
import { useMutation } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import type { Connection, ConnectionLevel } from '@shared/api'
import { swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { formatMoney, formatRelative } from '@/lib/format'
import { invalidateLedger, keys, queryClient } from '@/lib/query'
import { Badge, type Tone } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Menu } from '@/ui/Menu'
import { Dialog } from '@/ui/Overlay'
import { Panel } from '@/ui/Panel'
import { useToast } from '@/ui/Toast'

const LEVEL: Record<ConnectionLevel, { tone: Tone; icon: ReactNode; rail: string }> = {
  ok: { tone: 'positive', icon: <CheckCircleIcon size={12} weight="fill" />, rail: 'bg-positive' },
  updating: { tone: 'accent', icon: <CircleNotchIcon size={12} className="spin" />, rail: 'bg-accent' },
  attention: { tone: 'warning', icon: <WarningIcon size={12} weight="fill" />, rail: 'bg-warning' },
  error: { tone: 'negative', icon: <WarningCircleIcon size={12} weight="fill" />, rail: 'bg-negative' },
}

interface ConnectionCardProps {
  connection: Connection
  /** Abre o widget da Pluggy em modo de atualização para esta conexão. */
  onReconnect: () => void
  reconnecting: boolean
}

/** Uma instituição conectada: estado, última sincronização, contas e o que fazer quando algo trava. */
export function ConnectionCard({ connection, onReconnect, reconnecting }: ConnectionCardProps) {
  const notify = useToast()
  const [confirmRemove, setConfirmRemove] = useState(false)
  const { health, institution } = connection
  const level = LEVEL[health.level]

  const refresh = useMutation({
    mutationFn: () => api.connections.refresh(connection.id),
    onSuccess: (connections) => {
      queryClient.setQueryData(keys.connections, connections)
      notify('Atualização pedida à instituição.', 'info')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: () => api.connections.remove(connection.id),
    onSuccess: (connections) => {
      queryClient.setQueryData(keys.connections, connections)
      invalidateLedger()
      setConfirmRemove(false)
      notify('Conexão removida.')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const needsWidget = health.action === 'reconnect' || health.action === 'mfa'

  return (
    <Panel layout className="relative overflow-hidden">
      <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${level.rail}`} />
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-center gap-4">
          <span className="surface-sunken flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-full font-display text-lg font-semibold text-accent">
            {institution.imageUrl ? (
              <img src={institution.imageUrl} alt="" className="size-full object-cover" />
            ) : (
              institution.name.charAt(0)
            )}
          </span>
          <div className="min-w-0">
            <h2 className="truncate text-lg text-text">{institution.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
              <AnimatePresence mode="wait" initial={false}>
                <motion.span key={health.title} variants={swapVariants} initial="initial" animate="enter" exit="exit">
                  <Badge tone={level.tone} icon={level.icon}>
                    {health.title}
                  </Badge>
                </motion.span>
              </AnimatePresence>
              <span className="text-sm text-text-3">
                {connection.lastSyncedAt ? `Sincronizada ${formatRelative(connection.lastSyncedAt)}` : 'Ainda não sincronizada'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {needsWidget ? (
            <Button
              variant="primary"
              size="sm"
              loading={reconnecting}
              icon={health.action === 'mfa' ? <KeyIcon size={16} /> : <PlugsIcon size={16} />}
              onClick={onReconnect}
            >
              {health.action === 'mfa' ? 'Concluir conexão' : 'Reconectar'}
            </Button>
          ) : (
            <Button
              size="sm"
              loading={refresh.isPending}
              disabled={health.level === 'updating'}
              icon={<ArrowsClockwiseIcon size={16} />}
              onClick={() => refresh.mutate()}
            >
              Atualizar
            </Button>
          )}
          <Menu
            label={`Mais ações de ${institution.name}`}
            items={[
              ...(needsWidget
                ? []
                : [{ label: 'Refazer o login na instituição', icon: <PlugsIcon />, onSelect: onReconnect }]),
              { label: 'Remover conexão', icon: <TrashIcon />, tone: 'danger' as const, onSelect: () => setConfirmRemove(true) },
            ]}
          />
        </div>
      </div>

      <AnimatePresence initial={false}>
        {health.detail || connection.lastSyncError ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <p className="mt-4 text-base text-text-2">{health.detail}</p>
            {connection.lastSyncError ? (
              <p className="mt-2 text-sm text-negative">Última sincronização: {connection.lastSyncError}</p>
            ) : null}
          </motion.div>
        ) : null}
      </AnimatePresence>

      {connection.accounts.length ? (
        <ul className="mt-5 divide-y divide-edge border-t border-edge">
          {connection.accounts.map((account) => (
            <li key={account.id} className="flex items-center gap-3 py-3">
              <span className="text-text-3">{account.type === 'CREDIT' ? <CreditCardIcon /> : <BankIcon />}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-text">{account.name}</span>
                <span className="block truncate text-sm text-text-3">
                  {account.type === 'CREDIT'
                    ? [account.brand, account.number ? `final ${account.number}` : null].filter(Boolean).join(', ') || 'Cartão de crédito'
                    : (account.number ?? 'Conta')}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span className="tabular block font-medium text-text">{formatMoney(account.balanceCents, account.currencyCode)}</span>
                <span className="block text-sm text-text-3">{account.type === 'CREDIT' ? 'Fatura atual' : 'Saldo'}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-5 border-t border-edge pt-4 text-base text-text-3">
          Nenhuma conta recebida desta instituição até agora.
        </p>
      )}

      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title={`Remover ${institution.name}?`}
        description="A conexão é encerrada na Pluggy e as contas, faturas e transações desta instituição são apagadas deste Mac. Previsões cadastradas continuam."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Manter conexão
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Remover conexão
            </Button>
          </>
        }
      />
    </Panel>
  )
}
