import { useIsMutating, useMutation, useQuery } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import type { SyncRun } from '@shared/api'
import { api, ApiError } from '@/lib/api'
import { invalidateLedger, keys } from '@/lib/query'
import { plural } from '@/lib/format'
import { useToast } from '@/ui/Toast'

/** Frase curta sobre o resultado de uma execução, para o aviso passageiro. */
function describe(run: SyncRun): { message: string; tone: 'success' | 'error' | 'info' } {
  if (run.status === 'failed') {
    return { message: run.error ?? 'A sincronização falhou. Tente de novo em instantes.', tone: 'error' }
  }
  if (run.items.length === 0) {
    return { message: 'Nenhuma instituição conectada para sincronizar.', tone: 'info' }
  }
  if (run.status === 'partial') {
    const failed = run.items.filter((item) => !item.ok).map((item) => item.institution)
    const incomplete = run.items.filter((item) => item.ok && item.partial).map((item) => item.institution)
    return {
      message: failed.length
        ? `Sincronização parcial: sem resposta de ${failed.join(', ')}.`
        : `Sincronização parcial: ${incomplete.join(', ')} entregou só parte dos dados.`,
      tone: 'info',
    }
  }
  const matched = run.reconciliation.autoMatched
  return {
    message: matched
      ? `Tudo atualizado. ${plural(matched, 'previsão realizada', 'previsões realizadas')}.`
      : 'Tudo atualizado.',
    tone: 'success',
  }
}

/** Identifica a sincronização entre telas: o botão e o painel enxergam a mesma execução. */
const SYNC_MUTATION = ['sync-run']

export function useSync() {
  const notify = useToast()
  const state = useQuery({ queryKey: keys.sync, queryFn: api.sync.state })
  const inFlight = useIsMutating({ mutationKey: SYNC_MUTATION })

  const mutation = useMutation({
    mutationKey: SYNC_MUTATION,
    mutationFn: (trigger: 'open' | 'manual') => api.sync.run(trigger),
    onSuccess: (response, trigger) => {
      if (response.skipped) return
      invalidateLedger()
      // A sincronização automática só fala quando algo não saiu como esperado.
      if (response.run && (trigger === 'manual' || response.run.status !== 'success')) {
        const { message, tone } = describe(response.run)
        notify(message, tone)
      }
    },
    onError: (error, trigger) => {
      if (trigger === 'manual' || !(error instanceof ApiError && error.code === 'credentials_required')) {
        notify(error.message, 'error')
      }
    },
  })

  return {
    running: inFlight > 0 || state.data?.running === true,
    lastRun: state.data?.lastRun ?? null,
    lastSuccessAt: state.data?.lastSuccessAt ?? null,
    syncNow: () => mutation.mutate('manual'),
    syncOnOpen: () => mutation.mutate('open'),
  }
}

/** Dispara a sincronização de abertura uma única vez por visita à tela. */
export function useSyncOnOpen() {
  const { syncOnOpen } = useSync()
  const done = useRef(false)
  useEffect(() => {
    if (done.current) return
    done.current = true
    syncOnOpen()
    // Só na montagem: `syncOnOpen` muda de identidade a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
