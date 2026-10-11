import { useCallback, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import type { TransactionQuery } from '@shared/api'
import { isMonth } from '@shared/months'

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** Nome de cada filtro na URL (em português, como o resto do endereço). */
const PARAM = {
  q: 'q',
  month: 'mes',
  from: 'de',
  to: 'ate',
  bankId: 'banco',
  accountType: 'origem',
  accountId: 'conta',
  categoryId: 'categoria',
  direction: 'tipo',
  status: 'status',
  unidentified: 'fatura',
} as const

export type TransactionFilters = Omit<TransactionQuery, 'page' | 'pageSize'>

/**
 * Filtros de transações guardados na URL: dá para voltar, recarregar e chegar
 * já filtrado a partir do painel.
 */
export function useTransactionFilters() {
  const [params, setParams] = useSearchParams()

  const filters = useMemo<TransactionFilters>(() => {
    const month = params.get(PARAM.month)
    const from = params.get(PARAM.from)
    const to = params.get(PARAM.to)
    const direction = params.get(PARAM.direction)
    const status = params.get(PARAM.status)
    const origin = params.get(PARAM.accountType)
    return {
      q: params.get(PARAM.q) || undefined,
      month: isMonth(month) ? month : undefined,
      from: from && DATE.test(from) ? from : undefined,
      to: to && DATE.test(to) ? to : undefined,
      bankId: params.get(PARAM.bankId) || undefined,
      accountType: origin === 'cartao' ? 'CREDIT' : origin === 'conta' ? 'BANK' : undefined,
      accountId: params.get(PARAM.accountId) || undefined,
      categoryId: params.get(PARAM.categoryId) || undefined,
      direction: direction === 'in' || direction === 'out' ? direction : undefined,
      status: status === 'POSTED' || status === 'PENDING' ? status : undefined,
      unidentified: params.get(PARAM.unidentified) === 'nao-identificada' || undefined,
    }
  }, [params])

  const update = useCallback(
    (patch: Partial<TransactionFilters>) => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current)
          for (const [key, value] of Object.entries(patch) as [keyof TransactionFilters, unknown][]) {
            const name = PARAM[key]
            if (value === undefined || value === '' || value === false) next.delete(name)
            else if (key === 'unidentified') next.set(name, 'nao-identificada')
            else if (key === 'accountType') next.set(name, value === 'CREDIT' ? 'cartao' : 'conta')
            else next.set(name, String(value))
          }
          return next
        },
        { replace: true },
      )
    },
    [setParams],
  )

  const clear = useCallback(() => setParams({}, { replace: true }), [setParams])
  const active = Object.values(filters).filter((value) => value !== undefined).length

  return { filters, update, clear, active }
}
