import { ArrowsClockwiseIcon, CheckIcon, CopyIcon, RobotIcon } from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import type { McpConnectionKit } from '@shared/api'
import { swapVariants } from '@/design/motion'
import { Section } from '@/features/settings/SettingsPage'
import { api, ApiError } from '@/lib/api'
import { copyText } from '@/lib/clipboard'
import { keys, queryClient } from '@/lib/query'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Feedback'
import { Dialog } from '@/ui/Overlay'
import { Segmented } from '@/ui/Segmented'
import { useToast } from '@/ui/Toast'

type Access = 'read' | 'write'
type Format = 'prompt' | 'claude' | 'json'

const ACCESS_HELP: Record<Access, string> = {
  read: 'Os agentes consultam saldos, transações, previsões e conciliações. Nada do que eles fazem altera seus dados.',
  write:
    'Os agentes também podem sincronizar, criar previsões, recategorizar transações e decidir conciliações. Nada é apagado, e o agente deve pedir a sua confirmação antes de cada alteração.',
}

const FORMAT_HELP: Record<Format, string> = {
  prompt: 'Um texto para colar na conversa com qualquer agente. Ele mesmo se conecta.',
  claude: 'Um comando para rodar no terminal do Claude Code.',
  json: 'Um bloco para colar no .mcp.json de clientes que leem esse arquivo.',
}

const PICK: Record<Format, (kit: McpConnectionKit) => string> = {
  prompt: (kit) => kit.agentPrompt,
  claude: (kit) => kit.claudeCodeCommand,
  json: (kit) => kit.jsonConfig,
}

const COPIED_MS = 2600

export function AgentSettings() {
  const notify = useToast()
  const info = useQuery({ queryKey: keys.mcp, queryFn: api.mcp.info })
  const [format, setFormat] = useState<Format>('prompt')
  const [copied, setCopied] = useState(false)
  const [confirmRotate, setConfirmRotate] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), COPIED_MS)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = useMutation({
    mutationFn: (chosen: Format) => copyText(() => api.mcp.connectionKit().then(PICK[chosen])),
    onSuccess: () => {
      setCopied(true)
      notify('Copiado. O texto contém o token: cole só em agentes seus.')
    },
    onError: (error) =>
      notify(
        // Falha do servidor tem mensagem própria; o resto é o navegador recusando a área de transferência.
        error instanceof ApiError ? error.message : 'Não consegui copiar. Confira a permissão da área de transferência.',
        'error',
      ),
  })

  const changeAccess = useMutation({
    mutationFn: (access: Access) => api.settings.update({ mcpWriteEnabled: access === 'write' }),
    onSuccess: (next) => {
      queryClient.setQueryData(keys.settings, next)
      void queryClient.invalidateQueries({ queryKey: keys.mcp })
      notify(next.mcpWriteEnabled ? 'Escrita liberada para os agentes.' : 'Agentes só com leitura.')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const rotate = useMutation({
    mutationFn: api.mcp.rotateToken,
    onSuccess: (next) => {
      queryClient.setQueryData(keys.mcp, next)
      setConfirmRotate(false)
      setCopied(false)
      notify('Token novo gerado. Copie a conexão de novo para os seus agentes.')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const access: Access = info.data?.writeEnabled ? 'write' : 'read'

  return (
    <Section icon={<RobotIcon />} title="Agentes (MCP)">
      <p className="max-w-[62ch] text-sm text-text-3">
        Deixe seus agentes consultarem o Financeiro. Funciona enquanto o aplicativo estiver aberto, e só neste Mac.
      </p>

      {info.isPending ? (
        <Skeleton className="mt-5 h-40 rounded-md" />
      ) : info.isError ? (
        <p className="mt-5 text-base text-negative">Não consegui ler o acesso dos agentes. {info.error.message}</p>
      ) : (
        <>
          <Segmented
            label="O que os agentes podem fazer"
            className="mt-5 w-full"
            options={[
              { value: 'read', label: 'Só leitura' },
              { value: 'write', label: 'Leitura e escrita' },
            ]}
            value={access}
            onChange={(next) => next !== access && changeAccess.mutate(next)}
          />
          <div className="mt-3 min-h-16" aria-live="polite">
            <AnimatePresence mode="wait" initial={false}>
              <motion.p
                key={access}
                variants={swapVariants}
                initial="initial"
                animate="enter"
                exit="exit"
                className="max-w-[62ch] text-base text-text-2"
              >
                {ACCESS_HELP[access]}
              </motion.p>
            </AnimatePresence>
          </div>

          <div className="surface-sunken mt-2 rounded-md p-4">
            <Segmented
              label="Formato da conexão"
              size="sm"
              className="w-full"
              options={[
                { value: 'prompt', label: 'Prompt' },
                { value: 'claude', label: 'Claude Code' },
                { value: 'json', label: 'JSON' },
              ]}
              value={format}
              onChange={(next) => {
                setFormat(next)
                setCopied(false)
              }}
            />
            <div className="mt-3 min-h-10" aria-live="polite">
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={format}
                  variants={swapVariants}
                  initial="initial"
                  animate="enter"
                  exit="exit"
                  className="text-sm text-text-3"
                >
                  {FORMAT_HELP[format]}
                </motion.p>
              </AnimatePresence>
            </div>

            <Button variant="primary" className="mt-3 w-full" loading={copy.isPending} onClick={() => copy.mutate(format)}>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={copied ? 'copied' : 'idle'}
                  variants={swapVariants}
                  initial="initial"
                  animate="enter"
                  exit="exit"
                  className="inline-flex items-center gap-2"
                >
                  {copy.isPending ? null : copied ? <CheckIcon size={18} weight="bold" /> : <CopyIcon size={18} />}
                  {copied ? 'Copiado' : 'Copiar para o agente'}
                </motion.span>
              </AnimatePresence>
            </Button>
          </div>

          <dl className="mt-4 grid gap-x-4 gap-y-1 text-sm sm:grid-cols-[auto_1fr]">
            <dt className="text-text-3">Endereço</dt>
            <dd className="min-w-0 truncate text-text-2">
              <code>{info.data.url}</code>
            </dd>
            <dt className="text-text-3">Token</dt>
            <dd className="min-w-0 truncate text-text-2">
              <code>{info.data.tokenPreview}</code>
            </dd>
          </dl>

          <div className="mt-4">
            <Button variant="ghost" size="sm" icon={<ArrowsClockwiseIcon size={16} />} onClick={() => setConfirmRotate(true)}>
              Gerar novo token
            </Button>
          </div>

          <p className="mt-4 max-w-[62ch] text-sm text-text-3">
            Este controle vale para agentes que só falam com o Financeiro por aqui. Um agente que também roda comandos neste Mac
            alcança o aplicativo por fora e pode liberar a escrita sozinho. Para esses, revise cada comando antes de aprovar.
          </p>
        </>
      )}

      <Dialog
        open={confirmRotate}
        onClose={() => setConfirmRotate(false)}
        title="Gerar um novo token?"
        description="O token atual deixa de valer na hora. Agentes já conectados param de funcionar até receberem a conexão nova, que você copia de novo aqui."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRotate(false)}>
              Manter
            </Button>
            <Button variant="danger" loading={rotate.isPending} onClick={() => rotate.mutate()}>
              Gerar novo token
            </Button>
          </>
        }
      />
    </Section>
  )
}
