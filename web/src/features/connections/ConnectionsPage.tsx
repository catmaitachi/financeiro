import {
  ArrowSquareOutIcon,
  BrowsersIcon,
  PlugsConnectedIcon,
  PlusIcon,
  SlidersHorizontalIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef } from 'react'
import { useSearchParams } from 'react-router'
import type { ConnectScope } from '@shared/api'
import { collapseVariants, itemVariants, staggerVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { plural } from '@/lib/format'
import { invalidateLedger, keys } from '@/lib/query'
import { AgentSettings } from '@/features/agents/AgentSettings'
import { AppearanceSettings, ConnectionPreferences, CredentialsSettings, DataSettings } from '@/features/settings/SettingsPage'
import { Button } from '@/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/ui/Feedback'
import { Panel } from '@/ui/Panel'
import { ConnectionCard } from './ConnectionCard'
import { usePluggyConnect } from './usePluggyConnect'

/** Enquanto alguma instituição coleta dados, a lista é consultada de novo neste intervalo. */
const POLL_MS = 3000

const MEUPLUGGY_URL = 'https://meu.pluggy.ai'
const DASHBOARD_URL = 'https://dashboard.pluggy.ai'

/** Link externo no meio de uma frase: fica em linha, com o ícone colado na última palavra. */
const externalLink = 'font-medium whitespace-nowrap text-accent-strong underline decoration-accent/40 hover:decoration-accent'
const externalIcon = 'ml-1 inline align-[-0.125em]'

/** Como a tela se apresenta conforme o que o widget vai oferecer. */
const COPY: Record<ConnectScope, { action: string; another: string; title: string }> = {
  meupluggy: {
    action: 'Conectar pelo MeuPluggy',
    another: 'Conectar outro banco',
    title: 'Traga seus bancos pelo MeuPluggy',
  },
  sandbox: {
    action: 'Conectar banco de teste',
    another: 'Conectar outro banco',
    title: 'Conecte um banco de teste',
  },
  all: {
    action: 'Conectar instituição',
    another: 'Conectar instituição',
    title: 'Conecte seu primeiro banco ou cartão',
  },
}

export default function ConnectionsPage() {
  const { open, opening, problem } = usePluggyConnect()
  const [params, setParams] = useSearchParams()
  const settings = useQuery({ queryKey: keys.settings, queryFn: api.settings.get })
  const connections = useQuery({
    queryKey: keys.connections,
    queryFn: api.connections.list,
    refetchInterval: (query) => (query.state.data?.some((connection) => connection.health.level === 'updating') ? POLL_MS : false),
  })

  // Quando a coleta termina, os lançamentos novos já estão no banco: recarrega o resto.
  const updating = connections.data?.some((connection) => connection.health.level === 'updating') ?? false
  const wasUpdating = useRef(false)
  useEffect(() => {
    if (wasUpdating.current && !updating) invalidateLedger()
    wasUpdating.current = updating
  }, [updating])

  // Quem chega por "Conectar" em outra tela (`?conectar=1`) já encontra o widget abrindo.
  const autoOpened = useRef(false)
  useEffect(() => {
    if (params.get('conectar') !== '1' || autoOpened.current) return
    autoOpened.current = true
    setParams({}, { replace: true })
    void open()
  }, [params, setParams, open])

  const scope = settings.data?.connectScope ?? 'meupluggy'
  const copy = COPY[scope]
  const list = connections.data ?? []
  const troubled = list.filter((connection) => connection.health.level === 'error' || connection.health.level === 'attention').length

  return (
    <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col gap-6">
      <motion.header variants={itemVariants} className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl text-text">Conexões e ajustes</h1>
          <p className="mt-1 min-h-5 text-base text-text-3">
            {list.length
              ? `${plural(list.length, 'banco conectado', 'bancos conectados')}${troubled ? `, ${plural(troubled, 'pede', 'pedem')} atenção` : ''}`
              : 'Bancos, credenciais e preferências de conexão em um só lugar.'}
          </p>
        </div>
        {list.length ? (
          <Button variant="primary" icon={<PlusIcon weight="bold" />} loading={opening === 'new'} onClick={() => void open()}>
            {copy.another}
          </Button>
        ) : null}
      </motion.header>

      {/* Falta um passo fora do aplicativo: fica na tela até a próxima tentativa dar certo. */}
      <AnimatePresence initial={false} mode="wait">
        {problem === 'meupluggy_not_enabled' ? (
          <motion.div key="setup-needed" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <Notice
              tone="warning"
              icon={<SlidersHorizontalIcon size={20} />}
              title="Falta habilitar o MeuPluggy na sua Application"
              action={
                <Button size="sm" loading={opening === 'new'} onClick={() => void open()}>
                  Tentar de novo
                </Button>
              }
            >
              Abra o{' '}
              <a href={DASHBOARD_URL} target="_blank" rel="noreferrer noopener" className={externalLink}>
                Pluggy Dashboard
                <ArrowSquareOutIcon size={14} className={externalIcon} />
              </a>{' '}
              e, na aba Customization, deixe o MeuPluggy na lista de conectores. Sem isso a Pluggy só oferece os
              conectores pagos.
            </Notice>
          </motion.div>
        ) : problem === 'widget_blocked' ? (
          <motion.div key="widget-blocked" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <Notice
              tone="warning"
              icon={<BrowsersIcon size={20} />}
              title="A janela da Pluggy não carregou"
              action={
                <Button size="sm" loading={opening === 'new'} onClick={() => void open()}>
                  Tentar de novo
                </Button>
              }
            >
              A página connect.pluggy.ai, onde a autorização acontece, não respondeu. O motivo mais comum é o
              navegador bloquear essa página, como fazem navegadores embutidos e bloqueadores de conteúdo. Abra{' '}
              <span className="font-medium whitespace-nowrap text-text">{window.location.origin}</span> no Chrome ou no
              Safari e tente de novo.
            </Notice>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="grid items-start gap-6 lg:grid-cols-12">
        <motion.section variants={itemVariants} className="flex min-w-0 flex-col gap-4 lg:col-span-7">
          <div>
            <h2 className="text-lg text-text">Bancos conectados</h2>
            <p className="mt-1 text-sm text-text-3">Contas, cartões e o estado de cada sincronização.</p>
          </div>

          {connections.isPending ? (
            <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando conexões">
              <Skeleton className="h-48 rounded-lg" />
              <Skeleton className="h-48 rounded-lg" />
            </div>
          ) : connections.isError ? (
            <Notice
              tone="negative"
              icon={<WarningCircleIcon size={20} />}
              title="Não foi possível carregar as conexões"
              action={
                <Button size="sm" onClick={() => void connections.refetch()}>
                  Tentar de novo
                </Button>
              }
            >
              {connections.error.message}
            </Notice>
          ) : list.length === 0 ? (
            <Panel>
              <EmptyState
                icon={<PlugsConnectedIcon size={22} />}
                title={copy.title}
                action={
                  <Button variant="primary" icon={<PlusIcon weight="bold" />} loading={opening === 'new'} onClick={() => void open()}>
                    {copy.action}
                  </Button>
                }
              >
                {scope === 'meupluggy' ? (
                  <>
                    O MeuPluggy dá acesso gratuito aos seus próprios dados. Primeiro conecte cada banco em{' '}
                    <a href={MEUPLUGGY_URL} target="_blank" rel="noreferrer noopener" className={externalLink}>
                      meu.pluggy.ai
                      <ArrowSquareOutIcon size={14} className={externalIcon} />
                    </a>{' '}
                    e depois autorize aqui, um banco por vez.
                  </>
                ) : scope === 'sandbox' ? (
                  'O Pluggy Connect vai listar os bancos fictícios da Pluggy. Use os dados de acesso do guia do Sandbox.'
                ) : (
                  'O login acontece no Pluggy Connect, a janela oficial da Pluggy. Bancos diretos e Open Finance exigem um plano pago.'
                )}
              </EmptyState>
            </Panel>
          ) : (
            <div className="flex flex-col gap-6">
              <AnimatePresence initial={false} mode="popLayout">
                {list.map((connection) => (
                  <motion.div
                    key={connection.id}
                    layout="position"
                    variants={itemVariants}
                    initial="initial"
                    animate="enter"
                    exit={{ opacity: 0, scale: 0.98 }}
                  >
                    <ConnectionCard
                      connection={connection}
                      reconnecting={opening === connection.id}
                      onReconnect={() => void open(connection.id)}
                    />
                  </motion.div>
                ))}
              </AnimatePresence>
              {scope === 'meupluggy' ? (
                <motion.p variants={itemVariants} className="px-2 text-sm text-text-3">
                  Os dados chegam pelo MeuPluggy, que atualiza cada banco uma vez por dia. Para renovar um consentimento ou
                  acrescentar um banco, o caminho é o{' '}
                  <span className="whitespace-nowrap">
                    <a href={MEUPLUGGY_URL} target="_blank" rel="noreferrer noopener" className={externalLink}>
                      meu.pluggy.ai
                      <ArrowSquareOutIcon size={14} className={externalIcon} />
                    </a>
                    .
                  </span>
                </motion.p>
              ) : null}
            </div>
          )}
        </motion.section>

        <motion.aside variants={itemVariants} className="flex min-w-0 flex-col gap-4 lg:col-span-5">
          <div>
            <h2 className="text-lg text-text">Ajustes</h2>
            <p className="mt-1 text-sm text-text-3">Como o aplicativo acessa e guarda seus dados.</p>
          </div>
          <ConnectionPreferences />
          <AppearanceSettings />
          <CredentialsSettings />
          <AgentSettings />
          <DataSettings />
        </motion.aside>
      </div>
    </motion.div>
  )
}
