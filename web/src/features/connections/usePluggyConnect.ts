import { useCallback, useState } from 'react'
import { api, ApiError } from '@/lib/api'
import { invalidateLedger, keys, queryClient } from '@/lib/query'
import { useToast } from '@/ui/Toast'

/** Código de erro do servidor quando o MeuPluggy não está na lista de conectores da Application. */
const MEUPLUGGY_NOT_ENABLED = 'meupluggy_not_enabled'

/**
 * Prazo para o Pluggy Connect aparecer. Em um navegador comum ele leva cerca de
 * dois segundos; sem resposta até aqui, a página dele não carregou (o caso mais
 * comum é o navegador bloquear `connect.pluggy.ai`).
 */
const WIDGET_TIMEOUT_MS = 15_000

/** O que impede a conexão e não se resolve só tentando de novo: fica na tela. */
export type ConnectProblem = 'meupluggy_not_enabled' | 'widget_blocked'

/** Como termina a espera pelo widget: apareceu, foi fechado antes disso ou não respondeu. */
type Outcome = 'rendered' | 'closed' | 'timeout'

/**
 * Fecha uma tentativa que não chegou a aparecer, como a tecla Esc faria. O SDK só
 * expõe `destroy`, que desmonta tudo mas deixa a página com a rolagem travada;
 * por isso o fechamento usa a instância interna e cai no `destroy` se ela mudar.
 */
async function dismiss(widget: { destroy(): Promise<void> }) {
  const instance = (widget as { componentInstance?: { close?: () => PromiseLike<void> } }).componentInstance
  if (instance?.close) await instance.close()
  else await widget.destroy()
}

/**
 * Abre o Pluggy Connect, o widget oficial onde a pessoa autoriza o acesso.
 * O widget fala direto com a Pluggy usando um Connect Token temporário; a
 * aplicação só fica sabendo o `itemId` no final, e o envia ao servidor local.
 *
 * Quais instituições aparecem é decidido pelo servidor: por padrão o widget
 * abre direto no MeuPluggy, que é o acesso gratuito aos dados do próprio titular.
 *
 * @returns `open(itemId?)`: sem argumento cria uma conexão; com `itemId`,
 *   atualiza uma existente (nova autorização, código de confirmação).
 *   `problem` diz o que falta quando a conexão depende de um passo fora da tela.
 */
export function usePluggyConnect() {
  const notify = useToast()
  const [opening, setOpening] = useState<string | null>(null)
  const [problem, setProblem] = useState<ConnectProblem | null>(null)

  const open = useCallback(
    async (itemId?: string) => {
      setOpening(itemId ?? 'new')
      let timer: ReturnType<typeof setTimeout> | undefined
      // Fechar o widget antes de ele aparecer (Esc) encerra a tentativa sem ser um erro.
      let closed = false
      try {
        const [session, { PluggyConnect }] = await Promise.all([
          api.connections.connectSession(itemId),
          import('pluggy-connect-sdk'),
        ])
        const widget = new PluggyConnect({
          connectToken: session.connectToken,
          includeSandbox: session.includeSandbox,
          connectorIds: session.connectorIds ?? undefined,
          selectedConnectorId: session.selectedConnectorId ?? undefined,
          updateItem: itemId,
          language: 'pt',
          theme: 'dark',
          onClose: () => {
            closed = true
          },
          onSuccess: async ({ item }) => {
            try {
              queryClient.setQueryData(keys.connections, await api.connections.register(item.id))
              invalidateLedger()
              notify(itemId ? 'Conexão atualizada. Buscando os dados.' : 'Banco conectado. Buscando os dados.')
            } catch (error) {
              notify(error instanceof Error ? error.message : 'Não foi possível registrar a conexão.', 'error')
            }
          },
          onError: ({ message }) => {
            notify(message || 'A conexão não foi concluída. Tente de novo.', 'error')
            void queryClient.invalidateQueries({ queryKey: keys.connections })
          },
        })

        // `init` só termina quando a página da Pluggy responde de dentro do widget.
        const rendered = widget.init().then(
          (): Outcome => (closed ? 'closed' : 'rendered'),
          (error: unknown): Outcome => {
            if (closed) return 'closed'
            throw error
          },
        )
        const timedOut = new Promise<Outcome>((resolve) => {
          timer = setTimeout(() => resolve('timeout'), WIDGET_TIMEOUT_MS)
        })
        const outcome = await Promise.race([rendered, timedOut])
        if (outcome === 'rendered') {
          setProblem(null)
        } else if (outcome === 'timeout') {
          // Sem isso o carregador do widget ficaria na tela para sempre.
          closed = true
          await dismiss(widget)
          setProblem('widget_blocked')
        }
      } catch (error) {
        if (error instanceof ApiError && error.code === MEUPLUGGY_NOT_ENABLED) {
          // Não é um erro passageiro: exige um passo no Dashboard, então fica na tela.
          setProblem('meupluggy_not_enabled')
        } else {
          notify(error instanceof Error ? error.message : 'Não foi possível abrir o Pluggy Connect.', 'error')
        }
      } finally {
        clearTimeout(timer)
        setOpening(null)
      }
    },
    [notify],
  )

  return { open, opening, problem }
}
