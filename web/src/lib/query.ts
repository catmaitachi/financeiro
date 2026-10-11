import { QueryClient } from '@tanstack/react-query'
import type { TransactionQuery } from '@shared/api'
import type { Month } from '@shared/months'
import { ApiError } from './api'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Erro de regra (4xx) não melhora tentando de novo; falha de rede, talvez.
      retry: (failures, error) => !(error instanceof ApiError && error.status >= 400 && error.status < 500) && failures < 2,
    },
  },
})

/** Chaves de cache, agrupadas por módulo. */
export const keys = {
  setup: ['setup'] as const,
  settings: ['settings'] as const,
  mcp: ['mcp'] as const,
  connections: ['connections'] as const,
  sync: ['sync'] as const,
  dashboard: (month?: Month, windowEnd?: Month) => ['dashboard', month ?? 'atual', windowEnd ?? 'padrao'] as const,
  transactions: (query: TransactionQuery) => ['transactions', query] as const,
  categories: ['categories'] as const,
  accounts: ['accounts'] as const,
  forecasts: ['forecasts'] as const,
  reconciliation: ['reconciliation'] as const,
}

/** Tudo que depende dos lançamentos: recarrega depois de sincronizar ou corrigir algo. */
export function invalidateLedger() {
  for (const key of ['dashboard', 'transactions', 'forecasts', 'reconciliation', 'connections', 'accounts', 'categories', 'sync']) {
    void queryClient.invalidateQueries({ queryKey: [key] })
  }
}
