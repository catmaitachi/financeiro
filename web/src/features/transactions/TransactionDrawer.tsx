import { ArrowCounterClockwiseIcon } from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { useMemo, useRef, type ReactNode } from 'react'
import type { TransactionOverrideInput, TransactionRow } from '@shared/api'
import { TransactionSubscription } from '@/features/subscriptions/TransactionSubscription'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { formatDayLong, formatMoney, formatMonth } from '@/lib/format'
import { invalidateLedger, keys } from '@/lib/query'
import { Button } from '@/ui/Button'
import { SelectField } from '@/ui/Field'
import { Drawer } from '@/ui/Overlay'
import { Segmented } from '@/ui/Segmented'
import { useToast } from '@/ui/Toast'
import { exclusionReason } from './TransactionList'
import { groupCategories } from './TransactionFilterBar'

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <dt className="shrink-0 text-sm text-text-3">{label}</dt>
      <dd className="min-w-0 text-right text-base text-text">{children}</dd>
    </div>
  )
}

/** O que a regra automática decidiu sobre este lançamento. */
function automaticRule(transaction: TransactionRow): string {
  if (transaction.kind === 'bill_payment') {
    return 'Regra automática: fica fora, porque o gasto já foi contado nas compras do cartão.'
  }
  if (transaction.kind === 'internal_transfer') {
    return 'Regra automática: fica fora, porque é dinheiro seu indo de uma conta para outra.'
  }
  if (transaction.currencyCode !== 'BRL') {
    return 'Lançamentos em outra moeda aparecem à parte e não somam nos totais em reais.'
  }
  if (transaction.status === 'PENDING' && transaction.accountType === 'BANK') {
    return 'Regra automática: entra nos totais assim que o banco confirmar o lançamento.'
  }
  return 'Regra automática: entra nos totais.'
}

interface TransactionDrawerProps {
  transaction: TransactionRow | null
  onClose: () => void
}

/** Detalhes de um lançamento e as correções locais: categoria, assinatura e inclusão nos totais. */
export function TransactionDrawer({ transaction: current, onClose }: TransactionDrawerProps) {
  // Ao fechar, o último lançamento continua desenhado até a animação de saída terminar.
  const last = useRef(current)
  if (current) last.current = current
  const transaction = current ?? last.current

  const notify = useToast()
  const categories = useQuery({ queryKey: keys.categories, queryFn: api.categories })
  const groups = useMemo(() => groupCategories(categories.data ?? []), [categories.data])

  const override = useMutation({
    mutationFn: (input: TransactionOverrideInput) => api.transactions.override(transaction!.id, input),
    onSuccess: () => {
      invalidateLedger()
      notify('Correção salva.')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const categoryChanged = transaction ? transaction.categoryId !== transaction.originalCategoryId : false
  const inclusion = transaction?.includeOverride == null ? 'auto' : transaction.includeOverride ? 'include' : 'exclude'

  return (
    <Drawer
      open={current !== null}
      onClose={onClose}
      title={transaction?.description ?? ''}
      description={transaction ? `${formatDayLong(transaction.date)}${transaction.time ? `, às ${transaction.time}` : ''}` : undefined}
    >
      {transaction ? (
        <div className="flex flex-col gap-8">
          <div>
            <p className={cn('text-xl font-semibold', transaction.direction === 'in' ? 'text-positive' : 'text-negative')}>
              {transaction.direction === 'in' ? '+' : '−'} {formatMoney(transaction.amountCents, transaction.currencyCode)}
            </p>
            <p className="mt-1 text-sm text-text-3">
              {transaction.direction === 'in' ? 'Entrada' : 'Saída'}
              {transaction.included ? '' : `, ${exclusionReason(transaction).toLowerCase()}`}
            </p>
          </div>

          <dl className="divide-y divide-edge border-y border-edge">
            <Fact label="Conta">
              {transaction.bank.name}, {transaction.accountLabel.toLowerCase()}
            </Fact>
            <Fact label="Situação">{transaction.status === 'PENDING' ? 'Pendente' : 'Confirmado'}</Fact>
            {transaction.accountType === 'CREDIT' ? (
              <Fact label="Fatura">
                {transaction.competenceMonth
                  ? `${formatMonth(transaction.competenceMonth)}${transaction.competenceSource === 'forecast' ? ' (prevista)' : ''}`
                  : 'Não identificada'}
              </Fact>
            ) : null}
            {transaction.installment ? (
              <Fact label="Parcela">
                {transaction.installment.number} de {transaction.installment.total}
              </Fact>
            ) : null}
            {transaction.merchantName ? <Fact label="Estabelecimento">{transaction.merchantName}</Fact> : null}
            {transaction.linkedForecast ? <Fact label="Previsão liquidada">{transaction.linkedForecast.label}</Fact> : null}
          </dl>

          <section className="flex flex-col gap-3">
            <SelectField
              label="Categoria"
              value={transaction.categoryId ?? ''}
              disabled={override.isPending}
              onChange={(event) => override.mutate({ categoryId: event.target.value || null })}
              hint={categoryChanged ? 'Categoria corrigida por você.' : 'Categoria informada pela Pluggy.'}
            >
              <option value="">Sem categoria</option>
              {groups.map(({ root, children }) =>
                children.length ? (
                  <optgroup key={root.id} label={root.name}>
                    <option value={root.id}>{root.name}</option>
                    {children.map((child) => (
                      <option key={child.id} value={child.id}>
                        {child.name}
                      </option>
                    ))}
                  </optgroup>
                ) : (
                  <option key={root.id} value={root.id}>
                    {root.name}
                  </option>
                ),
              )}
            </SelectField>
            {categoryChanged ? (
              <Button
                size="sm"
                variant="ghost"
                className="self-start"
                icon={<ArrowCounterClockwiseIcon size={14} />}
                disabled={override.isPending}
                onClick={() => override.mutate({ categoryId: transaction.originalCategoryId })}
              >
                Voltar à categoria original
              </Button>
            ) : null}
          </section>

          <TransactionSubscription transaction={transaction} />

          <section className="flex flex-col gap-3">
            <p className="text-sm font-medium text-text-2">Nos totais do mês</p>
            <Segmented
              label="Inclusão nos totais"
              options={[
                { value: 'auto', label: 'Automático' },
                { value: 'include', label: 'Incluir' },
                { value: 'exclude', label: 'Excluir' },
              ]}
              value={inclusion}
              onChange={(value) => override.mutate({ includeInTotals: value === 'auto' ? null : value === 'include' })}
            />
            <p className="text-sm text-text-3">{automaticRule(transaction)}</p>
          </section>
        </div>
      ) : null}
    </Drawer>
  )
}
