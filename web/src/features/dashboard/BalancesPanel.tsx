import type { BankSummary } from '@shared/api'
import { BankLogo } from '@/features/banks/BankLogo'
import { formatBRL } from '@/lib/format'
import { Money } from '@/ui/Money'
import { Panel } from '@/ui/Panel'

/** Quanto há em conta, no total e em cada banco, e se cobre o que falta pagar em faturas. */
export function BalancesPanel({ banks }: { banks: BankSummary[] }) {
  const accounts = banks.filter((entry) => entry.balanceCents !== null)
  const total = accounts.reduce((sum, entry) => sum + entry.balanceCents!, 0)
  const unpaid = banks.reduce((sum, entry) => sum + (entry.bill && entry.bill.status !== 'paid' ? entry.bill.amountCents : 0), 0)
  const after = total - unpaid

  return (
    <Panel>
      <h2 className="font-sans text-sm font-medium tracking-normal text-text-3">Saldo em contas</h2>
      <Money cents={total} className="mt-1 block text-xl font-semibold text-text" />
      {unpaid > 0 ? (
        <p className="mt-1 text-sm text-text-3">
          {after >= 0 ? 'Sobram ' : 'Faltam '}
          <strong className="font-semibold text-text-2">
            {formatBRL(Math.abs(after))}
          </strong>{' '}
          {after >= 0 ? 'depois das faturas a pagar' : 'para cobrir as faturas a pagar'}
        </p>
      ) : null}

      {accounts.length ? (
        <ul className="mt-4 flex flex-col gap-3 border-t border-edge pt-4">
          {accounts.map((entry) => (
            <li key={entry.bank.id} className="flex items-center gap-3">
              <BankLogo bank={entry.bank} size="sm" />
              <span className="min-w-0 flex-1 truncate text-text-2">{entry.bank.name}</span>
              <span className="tabular font-medium text-text">{formatBRL(entry.balanceCents!)}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-base text-text-3">Nenhuma conta conectada.</p>
      )}
    </Panel>
  )
}
