import { ArrowCounterClockwiseIcon, CircleNotchIcon, FlaskIcon, WarningIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useState } from 'react'
import { AppRoutes } from '@/app/App'
import { pageVariants, swapVariants } from '@/design/motion'
import { setApiTransport } from '@/lib/api'
import { DEMO_APP_BASE } from '@/lib/demo'
import { Button } from '@/ui/Button'
import type { DemoStep } from './backend'

type Boot = { state: 'starting'; step: DemoStep } | { state: 'ready' } | { state: 'failed' }

const STEP_LABEL: Record<DemoStep, string> = {
  database: 'Abrindo o banco de dados dentro do navegador',
  banks: 'Conectando os bancos fictícios e sincronizando os lançamentos',
}

/** Uma partida só, mesmo que o React monte a tela duas vezes em desenvolvimento. */
let started: Promise<void> | null = null
let report: (step: DemoStep) => void = () => {}

function startOnce(): Promise<void> {
  started ??= import('./backend').then(async ({ startDemoBackend }) => {
    const backend = await startDemoBackend((step) => report(step))
    setApiTransport(backend)
  })
  return started
}

/** O aplicativo de verdade, servido por um servidor que roda nesta aba, sobre dados fictícios. */
export function DemoApp() {
  const [boot, setBoot] = useState<Boot>({ state: 'starting', step: 'database' })

  useEffect(() => {
    let current = true
    report = (step) => current && setBoot({ state: 'starting', step })
    startOnce().then(
      () => current && setBoot({ state: 'ready' }),
      () => current && setBoot({ state: 'failed' }),
    )
    return () => {
      current = false
    }
  }, [])

  return (
    <AnimatePresence mode="wait" initial={false}>
      {boot.state === 'ready' ? (
        <motion.div key="app" variants={pageVariants} initial="initial" animate="enter" exit="exit">
          <DemoBanner />
          <AppRoutes basename={DEMO_APP_BASE} />
        </motion.div>
      ) : (
        <motion.main
          key="boot"
          variants={pageVariants}
          initial="initial"
          animate="enter"
          exit="exit"
          className="relative z-(--z-content) grid min-h-dvh place-items-center px-6"
        >
          {boot.state === 'failed' ? (
            <div className="flex max-w-[44ch] flex-col items-start gap-4">
              <WarningIcon size={24} className="text-negative" />
              <h1 className="text-xl font-semibold text-text">A demonstração não conseguiu iniciar</h1>
              <p className="text-base text-text-2">
                O banco de dados da demonstração roda em WebAssembly, e este navegador não o carregou. Recarregue a
                página ou tente em outro navegador.
              </p>
              <Button variant="primary" icon={<ArrowCounterClockwiseIcon />} onClick={() => window.location.reload()}>
                Recarregar
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-center" role="status" aria-live="polite">
              <CircleNotchIcon size={24} className="spin text-text-2" />
              <h1 className="text-xl font-semibold text-text">Preparando a demonstração</h1>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p
                  key={boot.step}
                  variants={swapVariants}
                  initial="initial"
                  animate="enter"
                  exit="exit"
                  className="text-base text-text-2"
                >
                  {STEP_LABEL[boot.step]}
                </motion.p>
              </AnimatePresence>
            </div>
          )}
        </motion.main>
      )}
    </AnimatePresence>
  )
}

/** Faixa acima da navegação: deixa claro que nada ali é dinheiro de verdade. */
function DemoBanner() {
  return (
    <aside className="relative z-(--z-content) px-4 pt-4 md:px-6">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-x-3 gap-y-1 px-3 text-sm text-text-2">
        <p className="flex min-w-0 items-start gap-2">
          <FlaskIcon size={16} className="mt-px shrink-0 text-text-3" />
          <span>
            <span className="font-medium text-text">Demonstração com dados fictícios.</span> O que você alterar some ao
            recarregar a página.
          </span>
        </p>
        <a
          href={import.meta.env.BASE_URL}
          className="ml-auto rounded-full font-medium text-text underline decoration-edge-strong underline-offset-4 hover:decoration-text"
        >
          Sobre o projeto
        </a>
      </div>
    </aside>
  )
}
