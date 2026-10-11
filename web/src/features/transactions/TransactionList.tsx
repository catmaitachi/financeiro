import { CreditCardIcon, HourglassMediumIcon, LinkSimpleIcon, MinusCircleIcon, QuestionIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import type { ReactNode } from 'react'
import type { TransactionRow } from '@shared/api'
import { itemVariants } from '@/design/motion'
import { BankLogo } from '@/features/banks/BankLogo'
import { cn } from '@/lib/cn'
import { formatBRL, formatDayLong, formatMoney, formatMonthCompact } from '@/lib/format'
import { Badge } from '@/ui/Badge'

/** Por que um lançamento ficou fora dos totais, em uma expressão curta. */
export function exclusionReason(transaction: TransactionRow): string {
  if (transaction.includeOverride === false) return 'Excluído por você'
  if (transaction.kind === 'bill_payment') return 'Pagamento de fatura'
  if (transaction.kind === 'internal_transfer') return 'Entre contas próprias'
  return 'Fora dos totais'
}

function badgesFor(transaction: TransactionRow): ReactNode[] {
  const badges: ReactNode[] = []
  if (transaction.status === 'PENDING' && transaction.accountType === 'BANK') {
    badges.push(
      <Badge key="pending" tone="warning" icon={<HourglassMediumIcon size={12} />}>
        Pendente
      </Badge>,
    )
  }
  if (!transaction.included) {
    badges.push(
      <Badge key="excluded" icon={<MinusCircleIcon size={12} />}>
        {exclusionReason(transaction)}
      </Badge>,
    )
  }
  if (transaction.accountType === 'CREDIT') {
    badges.push(
      transaction.competenceMonth ? (
        <Badge key="bill" icon={<CreditCardIcon size={12} />}>
          Fatura de {formatMonthCompact(transaction.competenceMonth)}
          {transaction.status === 'PENDING' ? ', aberta' : ''}
        </Badge>
      ) : (
        <Badge key="bill" tone="warning" icon={<QuestionIcon size={12} />}>
          Fatura não identificada
        </Badge>
      ),
    )
  }
  if (transaction.installment) {
    badges.push(
      <Badge key="installment">
        Parcela {transaction.installment.number} de {transaction.installment.total}
      </Badge>,
    )
  }
  if (transaction.linkedForecast) {
    badges.push(
      <Badge key="forecast" tone="positive" icon={<LinkSimpleIcon size={12} />}>
        {transaction.linkedForecast.label}
      </Badge>,
    )
  }
  return badges
}

function Row({ transaction, onOpen }: { transaction: TransactionRow; onOpen: () => void }) {
  const incoming = transaction.direction === 'in'
  const badges = badgesFor(transaction)
  return (
    <motion.li layout="position" variants={itemVariants} initial="initial" animate="enter" exit="exit">
      <button
        type="button"
        onClick={onOpen}
        className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-md px-3 py-3 text-left hover:bg-fill-hover md:grid-cols-[auto_minmax(0,1.6fr)_minmax(0,1fr)_9.5rem]"
      >
        <BankLogo bank={transaction.bank} />
        <span className="min-w-0">
          <span className={cn('block truncate font-medium', transaction.included ? 'text-text' : 'text-text-2')}>
            {transaction.description}
          </span>
          <span className="block truncate text-sm text-text-3">
            {transaction.time ? <span className="tabular text-text-2">{transaction.time}, </span> : null}
            {transaction.bank.name}, {transaction.accountLabel.toLowerCase()}
          </span>
        </span>
        <span className="hidden truncate text-base text-text-2 md:block">{transaction.categoryName ?? 'Sem categoria'}</span>
        <span
          className={cn(
            'tabular text-right text-md font-medium whitespace-nowrap',
            !transaction.included ? 'text-text-3' : incoming ? 'text-positive' : 'text-negative',
          )}
        >
          {incoming ? '+' : '−'} {formatMoney(transaction.amountCents, transaction.currencyCode)}
        </span>
        {badges.length ? <span className="col-span-full col-start-2 flex flex-wrap gap-1.5">{badges}</span> : null}
      </button>
    </motion.li>
  )
}

function DayNet({ cents }: { cents: number }) {
  if (cents === 0) return null
  return (
    <span className="tabular text-sm whitespace-nowrap text-text-3">
      {cents > 0 ? '+' : '−'} {formatBRL(Math.abs(cents))}
    </span>
  )
}

interface TransactionListProps {
  transactions: TransactionRow[]
  onOpen: (transaction: TransactionRow) => void
}

/** "Hoje", "Ontem" ou a data por extenso. */
function dayLabel(date: string): string {
  const now = new Date()
  const iso = (value: Date) => `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`
  if (date === iso(now)) return `Hoje, ${formatDayLong(date).toLowerCase()}`
  if (date === iso(new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1))) return `Ontem, ${formatDayLong(date).toLowerCase()}`
  return formatDayLong(date)
}

/** Saldo do dia entre os lançamentos em reais que entram nos totais. */
function dayNet(items: TransactionRow[]): number {
  return items.reduce(
    (sum, item) => (item.included && item.currencyCode === 'BRL' ? sum + (item.direction === 'in' ? item.amountCents : -item.amountCents) : sum),
    0,
  )
}

/**
 * Linha do tempo: um marco por dia, do mais recente para o mais antigo, com os
 * lançamentos do dia logo abaixo.
 */
export function TransactionList({ transactions, onOpen }: TransactionListProps) {
  const groups: { date: string; items: TransactionRow[] }[] = []
  for (const transaction of transactions) {
    const last = groups[groups.length - 1]
    if (last?.date === transaction.date) last.items.push(transaction)
    else groups.push({ date: transaction.date, items: [transaction] })
  }

  return (
    <div className="relative flex flex-col gap-4 pl-7">
      <span className="absolute top-3 bottom-3 left-[7px] w-px bg-edge" aria-hidden="true" />
      <AnimatePresence initial={false} mode="popLayout">
        {groups.map((group) => (
          <motion.section key={group.date} layout="position" variants={itemVariants} initial="initial" animate="enter" exit="exit">
            <div className="relative flex items-baseline justify-between gap-4 px-3 pt-2 pb-1">
              <span className="absolute top-3.5 -left-[25px] size-2.5 rounded-full bg-accent ring-4 ring-accent-wash" aria-hidden="true" />
              <h2 className="font-sans text-base font-medium tracking-normal text-text-2">{dayLabel(group.date)}</h2>
              <DayNet cents={dayNet(group.items)} />
            </div>
            <ul className="flex flex-col">
              <AnimatePresence initial={false} mode="popLayout">
                {group.items.map((transaction) => (
                  <Row key={transaction.id} transaction={transaction} onOpen={() => onOpen(transaction)} />
                ))}
              </AnimatePresence>
            </ul>
          </motion.section>
        ))}
      </AnimatePresence>
    </div>
  )
}
