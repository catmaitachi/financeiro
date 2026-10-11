import { motion } from 'motion/react'
import { Link } from 'react-router'
import type { BillCategory } from '@shared/api'
import type { Month } from '@shared/months'
import { duration, ease } from '@/design/motion'
import type { BankTones } from '@/features/banks/tones'
import { CategoryIcon } from '@/features/categories/CategoryIcon'
import { cn } from '@/lib/cn'
import { formatBRL, formatMonthName } from '@/lib/format'
import { Panel, PanelHeader } from '@/ui/Panel'

interface BillCategoriesProps {
  month: Month
  categories: BillCategory[]
  tones: BankTones
}

/** A fatura unificada do mês por categoria, todas elas. Cada barra é dividida pelos bancos, nos mesmos tons do resto do Painel. */
export function BillCategories({ month, categories, tones }: BillCategoriesProps) {
  const rows = categories
  const total = categories.reduce((sum, category) => sum + category.cents, 0)
  const largest = Math.max(1, ...rows.map((row) => row.cents))

  return (
    <Panel>
      <PanelHeader
        title={`Fatura de ${formatMonthName(month)} por categoria`}
        description={rows.length ? `${formatBRL(total)} em compras nos cartões` : undefined}
      />
      {rows.length === 0 ? (
        <p className="py-8 text-center text-base text-text-3">Nenhuma compra nos cartões nesta fatura.</p>
      ) : (
        <ul className="-mx-3 flex flex-col">
          {rows.map((row) => {
            const content = (
              <span className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-x-3">
                <CategoryIcon categoryId={row.categoryId} className="row-span-2" />
                <span className="min-w-0 truncate font-medium text-text">{row.name}</span>
                <span className="tabular row-span-2 w-10 text-right text-sm text-text-3">
                  {total > 0 ? Math.round((row.cents / total) * 100) : 0}%
                </span>
                <span className="tabular row-span-2 w-24 text-right font-medium text-text">{formatBRL(row.cents)}</span>
                <motion.span
                  className="mt-2 flex h-2 origin-left gap-0.5"
                  initial={false}
                  animate={{ width: `${Math.max((row.cents / largest) * 100, 2)}%` }}
                  transition={{ duration: duration.layout, ease: ease.out }}
                >
                  {[...row.byBank]
                    .filter((share) => share.cents > 0)
                    .sort((a, b) => a.bankId.localeCompare(b.bankId))
                    .map((share) => (
                      <span
                        key={share.bankId}
                        className={cn('h-full rounded-[3px]', tones(share.bankId))}
                        style={{ flexGrow: share.cents, flexBasis: 0 }}
                      />
                    ))}
                </motion.span>
              </span>
            )
            const key = row.categoryId ?? 'sem-categoria'
            return (
              <motion.li key={key} layout="position" transition={{ duration: duration.layout, ease: ease.out }}>
                {row.categoryId ? (
                  <Link
                    to={`/transacoes?mes=${month}&categoria=${row.categoryId}&origem=cartao`}
                    className="block rounded-md px-3 py-2.5 hover:bg-fill-hover"
                  >
                    {content}
                  </Link>
                ) : (
                  <div className="px-3 py-2.5">{content}</div>
                )}
              </motion.li>
            )
          })}
        </ul>
      )}
    </Panel>
  )
}
