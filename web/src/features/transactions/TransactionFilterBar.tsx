import { CalendarDotsIcon, MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useMemo, useState } from 'react'
import type { Category } from '@shared/api'
import { addMonths, type Month } from '@shared/months'
import { collapseVariants, swapVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { formatMonth } from '@/lib/format'
import { keys } from '@/lib/query'
import { Button, IconButton } from '@/ui/Button'
import { Chip } from '@/ui/Chip'
import { SelectField, TextField } from '@/ui/Field'
import { Segmented } from '@/ui/Segmented'
import type { TransactionFilters } from './useTransactionFilters'

interface FilterBarProps {
  filters: TransactionFilters
  update: (patch: Partial<TransactionFilters>) => void
  clear: () => void
  active: number
  /** Lançamentos com data depois de hoje (parcelas futuras de cartão). */
  future: boolean
  /** Um período escolhido já inclui o que vier dentro dele: a opção fica fixa. */
  futureLocked: boolean
  onFutureChange: (next: boolean) => void
}

const CUSTOM = 'intervalo'

/** Competências oferecidas no filtro: do mês que vem até 18 meses atrás. */
function monthOptions(): Month[] {
  const now = new Date()
  const current = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return Array.from({ length: 20 }, (_, index) => addMonths(current, 1 - index))
}

/** Categorias agrupadas pela de primeiro nível, para o seletor. */
export function groupCategories(categories: Category[]) {
  const byId = new Map(categories.map((category) => [category.id, category]))
  const rootOf = (category: Category): Category => {
    let current = category
    while (current.parentId && byId.has(current.parentId)) current = byId.get(current.parentId)!
    return current
  }
  const groups = new Map<string, { root: Category; children: Category[] }>()
  for (const category of categories) {
    const root = rootOf(category)
    const group = groups.get(root.id) ?? { root, children: [] }
    if (category.id !== root.id) group.children.push(category)
    groups.set(root.id, group)
  }
  return [...groups.values()].sort((a, b) => a.root.name.localeCompare(b.root.name, 'pt-BR'))
}

/** Busca e filtros secundários (período, categoria, tipo), abaixo da escolha do banco. */
export function TransactionFilterBar({ filters, update, clear, active, future, futureLocked, onFutureChange }: FilterBarProps) {
  const categories = useQuery({ queryKey: keys.categories, queryFn: api.categories })
  const groups = useMemo(() => groupCategories(categories.data ?? []), [categories.data])
  const windowMonths = useMemo(monthOptions, [])
  // Uma fatura fora da janela (ex.: dezembro vindo do Painel) precisa ter opção, senão o seletor mostra "Qualquer período".
  const months = useMemo(
    () => (filters.month && !windowMonths.includes(filters.month) ? [...windowMonths, filters.month].sort().reverse() : windowMonths),
    [windowMonths, filters.month],
  )

  // A busca só vai para a URL depois de uma pausa na digitação.
  const [search, setSearch] = useState(filters.q ?? '')
  useEffect(() => setSearch(filters.q ?? ''), [filters.q])
  useEffect(() => {
    if (search === (filters.q ?? '')) return
    const timer = setTimeout(() => update({ q: search || undefined }), 280)
    return () => clearTimeout(timer)
  }, [search, filters.q, update])

  const [customOpen, setCustomOpen] = useState(Boolean(filters.from || filters.to))
  const custom = customOpen || Boolean(filters.from || filters.to)
  const period = custom ? CUSTOM : (filters.month ?? '')

  const scoped: { key: string; label: string; off: Partial<TransactionFilters> }[] = []
  if (filters.accountType) {
    scoped.push({ key: 'origem', label: filters.accountType === 'CREDIT' ? 'Só cartões' : 'Só contas', off: { accountType: undefined } })
  }
  if (filters.status) {
    scoped.push({ key: 'status', label: filters.status === 'PENDING' ? 'Só pendentes' : 'Só confirmados', off: { status: undefined } })
  }
  if (filters.unidentified) scoped.push({ key: 'fatura', label: 'Fatura não identificada', off: { unidentified: undefined } })

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-[1.6fr_1fr_1fr]">
        <TextField
          label="Buscar"
          hideLabel
          type="search"
          placeholder="Buscar por descrição, valor, data ou conta"
          title="Cada palavra precisa bater: netflix 44,90, 12/09 nubank, 09/2026"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          leading={<MagnifyingGlassIcon />}
          trailing={
            search ? (
              <IconButton label="Limpar busca" size="sm" onClick={() => setSearch('')}>
                <XIcon size={14} />
              </IconButton>
            ) : undefined
          }
        />
        <SelectField
          label="Período"
          hideLabel
          value={period}
          onChange={(event) => {
            const value = event.target.value
            setCustomOpen(value === CUSTOM)
            if (value === CUSTOM) update({ month: undefined })
            else update({ month: (value || undefined) as Month | undefined, from: undefined, to: undefined })
          }}
        >
          <option value="">Qualquer período</option>
          <optgroup label="Competência">
            {months.map((month) => (
              <option key={month} value={month}>
                {formatMonth(month)}
              </option>
            ))}
          </optgroup>
          <optgroup label="Data do lançamento">
            <option value={CUSTOM}>Intervalo de datas</option>
          </optgroup>
        </SelectField>
        <SelectField
          label="Categoria"
          hideLabel
          value={filters.categoryId ?? ''}
          onChange={(event) => update({ categoryId: event.target.value || undefined })}
        >
          <option value="">Todas as categorias</option>
          {groups.map(({ root, children }) =>
            children.length ? (
              <optgroup key={root.id} label={root.name}>
                <option value={root.id}>{root.name} (tudo)</option>
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
      </div>

      <AnimatePresence initial={false}>
        {custom ? (
          <motion.div
            key="custom-range"
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="overflow-hidden"
          >
            <div className="grid max-w-md grid-cols-2 gap-4 pb-1">
              <TextField
                label="De"
                type="date"
                value={filters.from ?? ''}
                max={filters.to}
                onChange={(event) => update({ from: event.target.value || undefined })}
              />
              <TextField
                label="Até"
                type="date"
                value={filters.to ?? ''}
                min={filters.from}
                onChange={(event) => update({ to: event.target.value || undefined })}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Tipo"
          size="sm"
          className="w-72"
          options={[
            { value: 'all', label: 'Tudo' },
            { value: 'in', label: 'Entradas' },
            { value: 'out', label: 'Saídas' },
          ]}
          value={filters.direction ?? 'all'}
          onChange={(value) => update({ direction: value === 'all' ? undefined : value })}
        />
        <Chip pressed={future} onClick={() => (futureLocked ? undefined : onFutureChange(!future))} icon={<CalendarDotsIcon size={16} />}>
          Parcelas futuras
        </Chip>
        <AnimatePresence>
          {/* Recortes que vêm de atalhos do Painel: aparecem só quando ativos, com a saída ao lado. */}
          {scoped.map((scope) => (
            <motion.div key={scope.key} variants={swapVariants} initial="initial" animate="enter" exit="exit">
              <Button size="sm" onClick={() => update(scope.off)} icon={<XIcon size={14} />} aria-label={`Remover filtro: ${scope.label}`}>
                {scope.label}
              </Button>
            </motion.div>
          ))}
          {active > 0 ? (
            <motion.div key="clear" variants={swapVariants} initial="initial" animate="enter" exit="exit" className="ml-auto">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setCustomOpen(false)
                  clear()
                }}
              >
                Limpar filtros
              </Button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  )
}
