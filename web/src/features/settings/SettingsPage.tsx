import {
  CheckCircleIcon,
  CloudSlashIcon,
  DatabaseIcon,
  KeyIcon,
  PaletteIcon,
  PlugsConnectedIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import type { ConnectScope, CredentialState, SetupStatus } from '@shared/api'
import { collapseVariants, itemVariants, staggerVariants, swapVariants } from '@/design/motion'
import { CredentialsForm } from '@/features/setup/CredentialsForm'
import { vaultPlace } from '@/features/setup/vault'
import { api } from '@/lib/api'
import { formatRelative } from '@/lib/format'
import { keys, queryClient } from '@/lib/query'
import { Badge, type Tone } from '@/ui/Badge'
import { backgroundOptions, type BackgroundVariant } from '@/ui/background-options'
import { Button } from '@/ui/Button'
import { Skeleton } from '@/ui/Feedback'
import { Dialog } from '@/ui/Overlay'
import { Panel } from '@/ui/Panel'
import { Segmented } from '@/ui/Segmented'
import { useToast } from '@/ui/Toast'
import { setBackgroundPreference, useBackgroundPreference } from '@/ui/useBackgroundPreference'

const STATE: Record<CredentialState, { label: string; tone: Tone; icon: ReactNode }> = {
  valid: { label: 'Aceitas pela Pluggy', tone: 'positive', icon: <CheckCircleIcon size={12} weight="fill" /> },
  invalid: { label: 'Recusadas pela Pluggy', tone: 'negative', icon: <WarningCircleIcon size={12} weight="fill" /> },
  unreachable: { label: 'Pluggy sem resposta', tone: 'warning', icon: <CloudSlashIcon size={12} weight="fill" /> },
  incomplete: { label: 'Incompletas', tone: 'negative', icon: <WarningCircleIcon size={12} weight="fill" /> },
  missing: { label: 'Não configuradas', tone: 'neutral', icon: <WarningCircleIcon size={12} /> },
}

/** O que cada opção de conexão significa, incluindo o que custa. */
const SCOPE_HELP: Record<ConnectScope, string> = {
  meupluggy:
    'O Pluggy Connect abre direto no MeuPluggy, o acesso gratuito aos seus próprios dados. Os bancos são conectados antes em meu.pluggy.ai.',
  sandbox:
    'Inclui os bancos fictícios da Pluggy na lista. Serve para validar o aplicativo sem tocar em uma conta real.',
  all: 'Mostra a lista completa de instituições. Conectar um banco direto ou por Open Finance exige um plano pago da Pluggy.',
}

export function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <Panel>
      <div className="mb-5 flex items-center gap-3">
        <span className="surface-sunken flex size-9 items-center justify-center rounded-full text-accent">{icon}</span>
        <h2 className="text-lg text-text">{title}</h2>
      </div>
      {children}
    </Panel>
  )
}

function Credentials({ status }: { status: SetupStatus }) {
  const notify = useToast()
  const [replacing, setReplacing] = useState(false)
  const [confirmRemove, setConfirmRemove] = useState(false)
  const state = STATE[status.state]
  const fromEnvironment = status.source === 'env'

  const test = useMutation({
    mutationFn: api.setup.test,
    onSuccess: (next) => {
      queryClient.setQueryData(keys.setup, next)
      notify(
        next.state === 'valid'
          ? 'A Pluggy aceitou as credenciais.'
          : next.state === 'unreachable'
            ? 'A Pluggy não respondeu. Tente de novo em instantes.'
            : 'A Pluggy recusou as credenciais.',
        next.state === 'valid' ? 'success' : next.state === 'unreachable' ? 'info' : 'error',
      )
    },
    onError: (error) => notify(error.message, 'error'),
  })

  const remove = useMutation({
    mutationFn: api.setup.remove,
    onSuccess: (next) => {
      setConfirmRemove(false)
      // Sem credenciais, o aplicativo volta sozinho para a tela de configuração.
      queryClient.setQueryData(keys.setup, next)
      notify('Credenciais removidas do cofre.')
    },
    onError: (error) => notify(error.message, 'error'),
  })

  return (
    <Section icon={<KeyIcon />} title="Credenciais da Pluggy">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <AnimatePresence mode="wait" initial={false}>
          <motion.span key={status.state} variants={swapVariants} initial="initial" animate="enter" exit="exit">
            <Badge tone={state.tone} icon={state.icon}>
              {state.label}
            </Badge>
          </motion.span>
        </AnimatePresence>
        <span className="text-base text-text-2">
          {fromEnvironment ? 'Lidas das variáveis de ambiente' : `Guardadas ${vaultPlace(status.vault)}`}
        </span>
        {status.checkedAt ? <span className="text-sm text-text-3">conferidas {formatRelative(status.checkedAt)}</span> : null}
      </div>
      <p className="mt-3 max-w-[62ch] text-sm text-text-3">
        O Client Secret nunca é mostrado nem enviado ao navegador. Para trocá-lo, cadastre um novo par.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button loading={test.isPending} onClick={() => test.mutate()}>
          Testar agora
        </Button>
        <Button onClick={() => setReplacing((value) => !value)} aria-expanded={replacing}>
          Substituir
        </Button>
        <Button variant="danger" disabled={fromEnvironment} onClick={() => setConfirmRemove(true)}>
          Remover
        </Button>
      </div>
      {fromEnvironment ? (
        <p className="mt-3 text-sm text-text-3">
          Estas credenciais vêm do arquivo .env. Para removê-las, apague as variáveis de lá e reinicie o aplicativo.
        </p>
      ) : null}

      <AnimatePresence initial={false}>
        {replacing ? (
          <motion.div key="replace" variants={collapseVariants} initial="initial" animate="enter" exit="exit" className="overflow-hidden">
            <div className="surface-sunken mt-5 rounded-md p-5">
              <p className="mb-4 text-base text-text-2">
                O novo par é testado antes de substituir o atual. Se a Pluggy recusar, nada muda.
              </p>
              <CredentialsForm
                submitLabel="Testar e substituir"
                onCancel={() => setReplacing(false)}
                onSaved={() => {
                  setReplacing(false)
                  notify('Credenciais substituídas.')
                }}
              />
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <Dialog
        open={confirmRemove}
        onClose={() => setConfirmRemove(false)}
        title="Remover as credenciais?"
        description="O aplicativo deixa de falar com a Pluggy e volta para a tela de configuração. Suas transações, conexões e previsões continuam guardadas nesta máquina."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmRemove(false)}>
              Manter
            </Button>
            <Button variant="danger" loading={remove.isPending} onClick={() => remove.mutate()}>
              Remover credenciais
            </Button>
          </>
        }
      />
    </Section>
  )
}

export function CredentialsSettings() {
  const setup = useQuery({ queryKey: keys.setup, queryFn: api.setup.status })
  return setup.data ? <Credentials status={setup.data} /> : <Skeleton className="h-56 rounded-lg" />
}

export function ConnectionPreferences() {
  const notify = useToast()
  const settings = useQuery({ queryKey: keys.settings, queryFn: api.settings.get })

  const update = useMutation({
    mutationFn: api.settings.update,
    onSuccess: (next) => {
      queryClient.setQueryData(keys.settings, next)
      notify('Preferência salva.')
    },
    onError: (error) => notify(error.message, 'error'),
  })
  const scope = settings.data?.connectScope ?? 'meupluggy'

  return (
    <Section icon={<PlugsConnectedIcon />} title="Modo de conexão">
      {settings.isPending ? (
        <Skeleton className="h-24 rounded-md" />
      ) : (
        <>
        <Segmented
          label="Instituições oferecidas ao conectar"
          className="w-full"
          options={[
            { value: 'meupluggy', label: 'MeuPluggy' },
            { value: 'sandbox', label: 'Sandbox' },
            { value: 'all', label: 'Todas' },
          ]}
          value={scope}
          onChange={(connectScope) => update.mutate({ connectScope })}
        />
        <div className="mt-4 min-h-10" aria-live="polite">
          <AnimatePresence mode="wait" initial={false}>
            <motion.p
              key={scope}
              variants={swapVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="max-w-[62ch] text-base text-text-2"
            >
              {SCOPE_HELP[scope]}
            </motion.p>
          </AnimatePresence>
        </div>
        </>
      )}
    </Section>
  )
}

export function AppearanceSettings() {
  const background = useBackgroundPreference()
  const active = backgroundOptions.find((option) => option.value === background)!

  const changeBackground = (next: BackgroundVariant) => {
    setBackgroundPreference(next)
  }

  return (
    <Section icon={<PaletteIcon />} title="Plano de fundo">
      <Segmented
        label="Estilo do plano de fundo"
        className="w-full"
        size="sm"
        options={backgroundOptions.map(({ value, label }) => ({ value, label }))}
        value={background}
        onChange={changeBackground}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={background}
          variants={swapVariants}
          initial="initial"
          animate="enter"
          exit="exit"
          className="mt-4 min-h-10 text-sm text-text-3"
        >
          {active.description}
        </motion.p>
      </AnimatePresence>
    </Section>
  )
}

export function DataSettings() {
  return (
    <Section icon={<DatabaseIcon />} title="Seus dados nesta máquina">
        <p className="max-w-[62ch] text-base text-text-2">
          Contas, transações e previsões ficam em um arquivo SQLite dentro da pasta <code className="text-text">data/</code> do
          projeto, que não entra no Git. Nenhuma credencial é gravada nele.
        </p>
        <p className="mt-3 max-w-[62ch] text-base text-text-2">
          O aplicativo só atende requisições vindas desta máquina. Não há login porque nada dele fica exposto na rede.
        </p>
    </Section>
  )
}

/** Mantida para links antigos; a navegação principal reúne estes blocos em Conexões. */
export default function SettingsPage() {
  return (
    <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex max-w-[760px] flex-col gap-6">
      <motion.header variants={itemVariants}>
        <h1 className="text-2xl text-text">Conexões e ajustes</h1>
      </motion.header>
      <CredentialsSettings />
      <ConnectionPreferences />
      <AppearanceSettings />
      <DataSettings />
    </motion.div>
  )
}
