import { ArrowSquareOutIcon, ShieldCheckIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Navigate, useNavigate } from 'react-router'
import type { SetupStatus } from '@shared/api'
import { itemVariants, staggerVariants } from '@/design/motion'
import { api } from '@/lib/api'
import { keys } from '@/lib/query'
import { Notice } from '@/ui/Feedback'
import { Panel } from '@/ui/Panel'
import { useToast } from '@/ui/Toast'
import { CredentialsForm } from './CredentialsForm'
import { vaultPlace } from './vault'

const GUIDE_URL = 'https://docs.pluggy.ai/en/docs/integration-checklist/api-keys'

const MEUPLUGGY_GUIDE_URL = 'https://github.com/pluggyai/meu-pluggy'

/**
 * A ordem importa: é um passo a passo, por isso a numeração. O caminho descrito
 * é o do MeuPluggy, que dá acesso gratuito aos dados do próprio titular.
 */
const STEPS = [
  {
    title: 'Conecte seus bancos no MeuPluggy',
    body: 'Em meu.pluggy.ai, crie sua conta e conecte cada banco pelo Open Finance. É gratuito para os seus próprios dados.',
  },
  {
    title: 'Habilite o MeuPluggy no Pluggy Dashboard',
    body: 'Em dashboard.pluggy.ai, abra a aba Customization e deixe o MeuPluggy na lista de conectores.',
  },
  {
    title: 'Crie uma Application e copie as chaves',
    body: 'No menu Applications, crie uma nova. O Client ID e o Client Secret aparecem na página dela: cole cada um no campo correspondente.',
  },
]

/** Para onde ir depois de validar: conectar a primeira instituição ou direto ao painel. */
export function destinationAfterSetup(status: SetupStatus): string {
  return status.hasConnections ? '/' : '/conexoes?conectar=1'
}

export function SetupPage() {
  const navigate = useNavigate()
  const notify = useToast()
  const setup = useQuery({ queryKey: keys.setup, queryFn: api.setup.status })

  // Já configurado e válido: esta tela não tem o que fazer.
  if (setup.data?.state === 'valid') return <Navigate to={destinationAfterSetup(setup.data)} replace />

  const problem =
    setup.data?.state === 'invalid'
      ? {
          title: 'A Pluggy recusou as credenciais atuais',
          body:
            setup.data.source === 'env'
              ? 'O par definido nas variáveis de ambiente não é mais aceito. Cadastre um par válido abaixo.'
              : 'O par guardado no cofre não é mais aceito. Gere novas chaves no Dashboard e cadastre abaixo.',
        }
      : setup.data?.state === 'incomplete'
        ? {
            title: 'Falta uma das duas credenciais',
            body: 'Encontrei só o Client ID ou só o Client Secret. Informe os dois abaixo.',
          }
        : null

  return (
    <motion.main
      variants={staggerVariants}
      initial="initial"
      animate="enter"
      className="relative z-(--z-content) mx-auto flex min-h-dvh w-full max-w-[1080px] flex-col justify-center px-4 py-12 md:px-6"
    >
      <motion.p variants={itemVariants} className="mb-10 font-display text-lg font-semibold tracking-tight">
        Financeiro
      </motion.p>

      <div className="grid items-start gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
        <div>
          <motion.h1 variants={itemVariants} className="text-2xl text-text">
            Ligue o Financeiro à sua conta Pluggy
          </motion.h1>
          <motion.p variants={itemVariants} className="mt-4 max-w-[52ch] text-md text-text-2">
            É pela Pluggy que o aplicativo lê suas contas e cartões. Com o MeuPluggy isso é gratuito para os seus
            próprios bancos; o aplicativo só precisa das credenciais de uma Application sua.
          </motion.p>

          <motion.ol variants={itemVariants} className="mt-8 flex flex-col gap-6">
            {STEPS.map((step, index) => (
              <li key={step.title} className="flex gap-4">
                <span className="surface-sunken flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-accent">
                  {index + 1}
                </span>
                <div>
                  <p className="text-md font-medium text-text">{step.title}</p>
                  <p className="mt-1 max-w-[48ch] text-base text-text-2">{step.body}</p>
                </div>
              </li>
            ))}
          </motion.ol>

          <motion.ul variants={itemVariants} className="mt-8 flex flex-col gap-2">
            {[
              { href: MEUPLUGGY_GUIDE_URL, label: 'Guia oficial do MeuPluggy para desenvolvedores' },
              { href: GUIDE_URL, label: 'Guia oficial da Pluggy para obter as chaves' },
            ].map((link) => (
              <li key={link.href}>
                <a
                  href={link.href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-2 font-medium text-accent-strong underline decoration-accent/40 hover:decoration-accent"
                >
                  {link.label}
                  <ArrowSquareOutIcon size={16} />
                </a>
              </li>
            ))}
          </motion.ul>
        </div>

        <div className="flex flex-col gap-4">
          {problem ? (
            <motion.div variants={itemVariants}>
              <Notice tone="negative" icon={<WarningCircleIcon size={20} />} title={problem.title}>
                {problem.body}
              </Notice>
            </motion.div>
          ) : null}

          <Panel>
            <h2 className="text-lg text-text">Credenciais da Application</h2>
            <p className="mt-1 mb-6 text-sm text-text-3">O par é testado na Pluggy antes de ser guardado.</p>
            <CredentialsForm
              onSaved={(status) => {
                notify(`Credenciais validadas e guardadas ${vaultPlace(status.vault)}.`)
                navigate(destinationAfterSetup(status), { replace: true })
              }}
            />
          </Panel>

          <motion.div variants={itemVariants} className="flex gap-3 px-2 text-sm text-text-2">
            <ShieldCheckIcon size={20} className="mt-0.5 shrink-0 text-positive" />
            <p>
              Essas credenciais dão acesso aos seus dados financeiros. Não as compartilhe nem as cole em outros sites.
              Aqui elas ficam {vaultPlace(setup.data?.vault)} e nunca voltam para o navegador.
            </p>
          </motion.div>
        </div>
      </div>
    </motion.main>
  )
}
