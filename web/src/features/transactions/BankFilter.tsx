import { BankIcon, CreditCardIcon, SquaresFourIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useMemo } from 'react'
import type { BankRef } from '@shared/banks'
import { collapseVariants } from '@/design/motion'
import { BankLogo } from '@/features/banks/BankLogo'
import { api } from '@/lib/api'
import { keys } from '@/lib/query'
import { Chip } from '@/ui/Chip'
import { Segmented } from '@/ui/Segmented'
import type { TransactionFilters } from './useTransactionFilters'

const ALL = ''

interface BankFilterProps {
  filters: TransactionFilters
  update: (patch: Partial<TransactionFilters>) => void
}

/**
 * O recorte principal da lista: o banco. Contas e cartões aparecem logo abaixo
 * só como filtro, depois que um banco é escolhido.
 */
export function BankFilter({ filters, update }: BankFilterProps) {
  const accounts = useQuery({ queryKey: keys.accounts, queryFn: api.accounts })
  const banks = useMemo(() => {
    const seen = new Map<string, BankRef>()
    for (const account of accounts.data ?? []) seen.set(account.bank.id, account.bank)
    return [...seen.values()]
  }, [accounts.data])

  const selected = banks.find((bank) => bank.id === filters.bankId)
  const ofBank = (accounts.data ?? []).filter((account) => account.bank.id === selected?.id)

  if (banks.length === 0) return null

  return (
    <div className="flex flex-col">
      <Segmented
        label="Banco"
        className="w-full max-w-2xl"
        options={[
          { value: ALL, label: 'Todos', icon: <SquaresFourIcon /> },
          ...banks.map((bank) => ({ value: bank.id, label: bank.name, icon: <BankLogo bank={bank} size="sm" /> })),
        ]}
        value={selected?.id ?? ALL}
        // Trocar de banco desfaz o filtro de conta, que pertence ao banco anterior.
        compactBelow="md"
        onChange={(bankId) => update({ bankId: bankId || undefined, accountId: undefined })}
      />

      <AnimatePresence initial={false}>
        {selected && ofBank.length > 1 ? (
          <motion.div
            key={selected.id}
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="flex flex-wrap items-center gap-2 px-1 pt-3 pb-1" role="group" aria-label={`Contas e cartões do ${selected.name}`}>
              {ofBank.map((account) => (
                <Chip
                  key={account.id}
                  pressed={filters.accountId === account.id}
                  onClick={() => update({ accountId: filters.accountId === account.id ? undefined : account.id })}
                  icon={account.type === 'CREDIT' ? <CreditCardIcon size={16} /> : <BankIcon size={16} />}
                >
                  {account.label}
                </Chip>
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
