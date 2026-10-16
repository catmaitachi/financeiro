import {
  ArrowSquareOutIcon,
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
import { formatDay, formatMoney, formatRelative } from '@/lib/format'
import { invalidateLedger, keys, queryClient } from '@/lib/query'
import { Badge, type Tone } from '@/ui/Badge'
import { Button } from '@/ui/Button'
import { Menu } from '@/ui/Menu'
import { Dialog } from '@/ui/Overlay'
import { Panel } from '@/ui/Panel'
import { useToast } from '@/ui/Toast'

/** Depois disso sem dados novos da instituição, o cartão avisa: o normal é uma leitura por dia. */
const STALE_AFTER_MS = 2 * 86_400_000

/** O dia, no calendário local, de um instante ISO. */
function localDay(iso: string): string {
  const date = new Date(iso)
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

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

  const refresh = useMutation({
    mutationFn: () => api.connections.refresh(connection.id),
    onSuccess: ({ requested, connections }) => {
      queryClient.setQueryData(keys.connections, connections)
      if (requested) {
        notify('Atualização pedida à instituição.', 'info')
        return
      }
      invalidateLedger()
      notify('O MeuPluggy não aceita pedidos de atualização: ele lê cada banco uma vez por dia. O que ele já tinha foi copiado de novo.', 'info')
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
  // A sincronização só copia o que a instituição já entregou; o que envelhece é a leitura dela.
  const stale =
    connection.providerUpdatedAt !== null && Date.now() - Date.parse(connection.providerUpdatedAt) > STALE_AFTER_MS && health.level === 'ok'
  const ownData = institution.name.replace(/\s+/g, '').toLowerCase() === 'meupluggy'
  // Conectada e sem erro, mas parada: "Em dia" seria enganoso.
  const level = LEVEL[stale ? 'attention' : health.level]
  const title = stale ? 'Sem dados novos' : health.title

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
                <motion.span key={title} variants={swapVariants} initial="initial" animate="enter" exit="exit">
                  <Badge tone={level.tone} icon={level.icon}>
                    {title}
                  </Badge>
                </motion.span>
              </AnimatePresence>
              <span className="text-sm text-text-3">
                {connection.providerUpdatedAt ? `Dados do banco de ${formatDay(localDay(connection.providerUpdatedAt))}, ` : ''}
                {connection.lastSyncedAt
                  ? `${connection.providerUpdatedAt ? 'copiados' : 'Sincronizada'} ${formatRelative(connection.lastSyncedAt)}`
                  : 'Ainda não sincronizada'}
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
        {health.detail || connection.lastSyncError || stale ? (
          <motion.div
            key="detail"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            {health.detail ? <p className="mt-4 text-base text-text-2">{health.detail}</p> : null}
            {stale ? (
              <p className="mt-4 text-base text-text-2">
                {ownData ? (
                  <>
                    O MeuPluggy não entrega dados novos desde {formatDay(localDay(connection.providerUpdatedAt!))}. Confira os bancos em{' '}
                    <a
                      href="https://meu.pluggy.ai"
                      target="_blank"
                      rel="noreferrer noopener"
                      className="font-medium whitespace-nowrap text-accent-strong underline decoration-accent/40 hover:decoration-accent"
                    >
                      meu.pluggy.ai
                      <ArrowSquareOutIcon size={14} className="ml-1 inline align-[-0.125em]" />
                    </a>
                    : se algum pedir para reconectar ou renovar o consentimento, faça por lá e depois clique em Atualizar aqui.
                  </>
                ) : (
                  `A instituição não entrega dados novos desde ${formatDay(localDay(connection.providerUpdatedAt!))}. Se continuar assim, refaça o login.`
                )}
              </p>
            ) : null}
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
        description="A conexão é encerrada na Pluggy e as contas, faturas e transações desta instituição são apagadas desta máquina. Previsões cadastradas continuam."
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
