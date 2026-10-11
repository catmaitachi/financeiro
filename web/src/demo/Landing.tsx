import {
  AppleLogoIcon,
  ArrowRightIcon,
  CheckIcon,
  CopyIcon,
  GithubLogoIcon,
  LinuxLogoIcon,
  WindowsLogoIcon,
} from '@phosphor-icons/react'
import {
  AnimatePresence,
  motion,
  useMotionValueEvent,
  useReducedMotion,
  useScroll,
  useTransform,
  type MotionValue,
} from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { BankRef } from '@shared/banks'
import { ForecastExpressionError, parseForecastExpression } from '@shared/forecast-expression'
import { collapseVariants, duration, ease, itemVariants, staggerVariants, swapVariants } from '@/design/motion'
import { BankLogo } from '@/features/banks/BankLogo'
import { describePlan } from '@/features/forecasts/ForecastComposer'
import { cn } from '@/lib/cn'
import { DEMO_APP_BASE, REPOSITORY_URL } from '@/lib/demo'
import { todayIso } from '@/lib/format'
import { AnchorButton, Button } from '@/ui/Button'
import { TextField } from '@/ui/Field'
import { LiquidBar } from '@/ui/LiquidBar'
import { useToast } from '@/ui/Toast'
import connectionsShot from '../../../docs/tela-conexoes.png'
import dashboardShot from '../../../docs/tela-painel.png'
import forecastsShot from '../../../docs/tela-previsoes.png'
import transactionsShot from '../../../docs/tela-transacoes.png'

const DEMO_URL = `${DEMO_APP_BASE}/`

const INSTALL = ['git clone https://github.com/catmaitachi/financeiro.git', 'cd financeiro', 'npm install', 'npm run dev']

/** Entrada de seção ao chegar na janela: uma vez, um pouco antes de a seção ficar inteira à vista. */
const inView = { initial: 'initial', whileInView: 'enter', viewport: { once: true, margin: '-80px' } } as const

const HEADING = 'text-xl font-semibold text-balance text-text md:text-2xl'

export function Landing() {
  return (
    <div className="relative z-(--z-content) flex min-h-dvh flex-col">
      <header className="sticky top-0 z-(--z-nav) px-4 pt-4 md:px-6">
        <LiquidBar className="mx-auto h-16 max-w-[1180px]">
          <div className="flex w-full items-center justify-between gap-4 pr-3 pl-6">
            <a href={import.meta.env.BASE_URL} className="font-display text-lg font-semibold text-text">
              Financeiro
            </a>
            <nav className="flex items-center gap-2" aria-label="Atalhos">
              <AnchorButton variant="ghost" href={REPOSITORY_URL} icon={<GithubLogoIcon />} className="max-sm:hidden">
                Código
              </AnchorButton>
              <AnchorButton variant="primary" href={DEMO_URL}>
                Abrir a demonstração
              </AnchorButton>
            </nav>
          </div>
        </LiquidBar>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 md:px-6">
        <Hero />

        <motion.section variants={staggerVariants} {...inView} className="mt-16 flex max-w-[62ch] flex-col gap-4 md:mt-24">
          <motion.h2 variants={itemVariants} className={HEADING}>
            Cada compra no mês da fatura
          </motion.h2>
          <motion.p variants={itemVariants} className="text-md text-text-2">
            O Painel mostra quanto falta pagar de fatura, quanto está previsto para entrar e se uma coisa cobre a outra,
            banco por banco.
          </motion.p>
          <motion.p variants={itemVariants} className="text-base text-text-3">
            A demonstração é o aplicativo de verdade rodando inteiro no seu navegador, com bancos e lançamentos
            fictícios. Nada é enviado a servidor nenhum.
          </motion.p>
        </motion.section>

        <ScreenTour />

        <motion.section variants={staggerVariants} {...inView} className="mt-24 md:mt-32">
          <motion.h2 variants={itemVariants} className={cn(HEADING, 'max-w-[22ch]')}>
            Previsão que se escreve como uma conta
          </motion.h2>
          <motion.p variants={itemVariants} className="mt-4 max-w-[56ch] text-md text-text-2">
            Este é o campo do aplicativo, com o analisador de verdade. Quando o dinheiro chega ao banco, a baixa é
            automática.
          </motion.p>
          <motion.div variants={itemVariants} className="mt-8">
            <ExpressionPlayground />
          </motion.div>
        </motion.section>

        <Facts />

        <motion.section
          variants={staggerVariants}
          {...inView}
          className="mt-24 grid items-start gap-x-12 gap-y-8 md:mt-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <motion.div variants={itemVariants} className="flex min-w-0 flex-col items-start gap-4">
            <h2 className={HEADING}>Rode com os seus bancos</h2>
            <p className="max-w-[48ch] text-base text-text-2">
              No primeiro acesso, o aplicativo pede as chaves da sua Application na Pluggy e testa o par antes de
              guardar.
            </p>
            <AnchorButton href={`${REPOSITORY_URL}#começar`} icon={<ArrowRightIcon />} className="flex-row-reverse">
              Guia completo no README
            </AnchorButton>
          </motion.div>
          <motion.div variants={itemVariants} className="min-w-0">
            <InstallCommands />
          </motion.div>
        </motion.section>
      </main>

      <footer className="mx-auto mt-24 w-full max-w-[1180px] px-4 pb-12 md:mt-32 md:px-6">
        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-edge pt-6 text-sm text-text-3">
          <p>
            Feito por{' '}
            <a href="https://github.com/catmaitachi" className="text-text-2 hover:text-text">
              Lucas Spiazzi
            </a>
            . Open Finance pela{' '}
            <a href="https://pluggy.ai" className="text-text-2 hover:text-text">
              Pluggy
            </a>
            .
          </p>
          <a href={`${REPOSITORY_URL}/blob/main/LICENSE`} className="text-text-2 hover:text-text">
            Licença MIT
          </a>
        </div>
      </footer>
    </div>
  )
}

/**
 * A primeira dobra. A tela do produto chega deitada, como um papel sobre a
 * mesa, e se levanta conforme a página rola: é a rolagem que traz o produto
 * para a frente do leitor.
 */
function Hero() {
  const frame = useRef<HTMLDivElement>(null)
  const still = useReducedMotion()
  const { scrollYProgress } = useScroll({ target: frame, offset: ['start end', 'start 0.2'] })
  const rotateX = useTransform(scrollYProgress, [0, 1], [26, 0])
  const scale = useTransform(scrollYProgress, [0, 1], [0.9, 1])
  const lift = useTransform(scrollYProgress, [0, 1], [48, 0])

  return (
    <section className="pt-12 md:pt-16">
      <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col items-start">
        <motion.h1
          variants={itemVariants}
          className="max-w-[26ch] text-2xl font-semibold tracking-[-0.03em] text-balance text-text lg:text-display"
        >
          Seu dinheiro, num painel que roda só na sua máquina.
        </motion.h1>
        <motion.p variants={itemVariants} className="mt-6 max-w-[52ch] text-md text-text-2">
          Contas e cartões chegam pelo Open Finance. Cada compra cai no mês da fatura, e as previsões recebem baixa
          sozinhas.
        </motion.p>
        <motion.div variants={itemVariants} className="mt-8 flex flex-wrap items-center gap-3">
          <AnchorButton variant="primary" href={DEMO_URL} icon={<ArrowRightIcon />} className="flex-row-reverse">
            Abrir a demonstração
          </AnchorButton>
          <AnchorButton href={REPOSITORY_URL} icon={<GithubLogoIcon />}>
            Ver o código no GitHub
          </AnchorButton>
        </motion.div>
      </motion.div>

      <div ref={frame} className="mt-12 [perspective:1600px]">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: duration.entrance, ease: ease.out, delay: 0.12 }}
          style={still ? undefined : { rotateX, scale, y: lift, transformOrigin: '50% 0%' }}
        >
          <a
            href={DEMO_URL}
            aria-label="Abrir a demonstração no Painel"
            className="group surface block overflow-hidden rounded-lg p-2"
          >
            <img
              src={dashboardShot}
              width={1920}
              height={1200}
              alt="Painel do Financeiro: faturas do mês por banco, previsão de entradas, últimas transações e saldo em contas"
              className="w-full rounded-md transition-transform duration-(--dur-layout) ease-out group-hover:scale-[1.01]"
            />
          </a>
        </motion.div>
      </div>
    </section>
  )
}

const SCREENS = [
  {
    title: 'Todos os bancos numa linha do tempo',
    body: 'Filtro por banco, período, categoria e direção. Pagamento de fatura e transferência entre as suas contas ficam fora dos totais.',
    image: transactionsShot,
    alt: 'Lista de transações agrupada por dia, com busca e filtros por banco, período e categoria',
  },
  {
    title: 'O que ainda vai entrar e sair',
    body: 'Saldo previsto, a receber e a pagar, mês a mês. O que for ambíguo vai para uma fila de revisão, em vez de ser adivinhado.',
    image: forecastsShot,
    alt: 'Tela de previsões com saldo previsto, formulário de nova previsão e a lista de entradas por mês',
  },
  {
    title: 'Cada banco, e o que ele pede de você',
    body: 'A última sincronização de cada conexão e o que precisa da sua atenção, como um banco aguardando confirmação.',
    image: connectionsShot,
    alt: 'Tela de conexões com os bancos conectados, o estado de cada sincronização e os ajustes de acesso',
  },
]

/** Quanto de rolagem cada tela ocupa enquanto a visita está presa na janela. */
const SCREEN_SCROLL_VH = 70

/**
 * A visita pelas telas. Em telas largas a seção prende na janela e a rolagem
 * troca a tela mostrada, com o texto de cada parada ao lado; em telas
 * estreitas vira uma sequência simples, sem prender nada.
 */
function ScreenTour() {
  const track = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)
  const { scrollYProgress } = useScroll({ target: track, offset: ['start start', 'end end'] })

  // O índice só muda ao cruzar uma parada: o React não re-renderiza a cada quadro de rolagem.
  useMotionValueEvent(scrollYProgress, 'change', (progress) => {
    const next = Math.min(SCREENS.length - 1, Math.max(0, Math.floor(progress * SCREENS.length)))
    setActive((current) => (current === next ? current : next))
  })

  const goTo = (index: number) => {
    const element = track.current
    if (!element) return
    const top = element.getBoundingClientRect().top + window.scrollY
    const travel = element.offsetHeight - window.innerHeight
    // Um pouco para dentro da parada, para o índice não ficar na fronteira.
    window.scrollTo({ top: top + (travel * (index + 0.1)) / SCREENS.length, behavior: 'smooth' })
  }

  return (
    <>
      <section
        ref={track}
        className="relative mt-24 hidden lg:block"
        style={{ height: `calc(100dvh + ${SCREENS.length * SCREEN_SCROLL_VH}vh)` }}
        aria-label="Visita pelas telas"
      >
        <div className="sticky top-0 grid h-dvh grid-cols-[minmax(0,5fr)_minmax(0,7fr)] items-center gap-12 pt-20">
          <ol className="flex flex-col">
            {SCREENS.map((screen, index) => (
              <TourStop
                key={screen.title}
                title={screen.title}
                body={screen.body}
                open={index === active}
                progress={scrollYProgress}
                range={[index / SCREENS.length, (index + 1) / SCREENS.length]}
                onSelect={() => goTo(index)}
              />
            ))}
          </ol>
          <div className="surface relative aspect-[16/10] overflow-hidden rounded-lg">
            {SCREENS.map((screen, index) => (
              <motion.img
                key={screen.image}
                src={screen.image}
                alt={screen.alt}
                aria-hidden={index !== active}
                initial={false}
                animate={{ opacity: index === active ? 1 : 0, scale: index === active ? 1 : 1.03 }}
                transition={{ duration: duration.layout, ease: ease.out }}
                className="absolute inset-2 size-[calc(100%-16px)] rounded-md object-cover object-top"
              />
            ))}
          </div>
        </div>
      </section>

      <div className="mt-16 flex flex-col gap-16 lg:hidden">
        {SCREENS.map((screen) => (
          <motion.section key={screen.title} variants={staggerVariants} {...inView} className="flex flex-col gap-4">
            <motion.h2 variants={itemVariants} className={HEADING}>
              {screen.title}
            </motion.h2>
            <motion.p variants={itemVariants} className="max-w-[56ch] text-base text-text-2">
              {screen.body}
            </motion.p>
            <motion.div variants={itemVariants} className="surface overflow-hidden rounded-lg p-2">
              <img
                src={screen.image}
                alt={screen.alt}
                loading="lazy"
                width={1920}
                height={1200}
                className="aspect-[16/11] w-full rounded-md object-cover object-top"
              />
            </motion.div>
          </motion.section>
        ))}
      </div>
    </>
  )
}

interface TourStopProps {
  title: string
  body: string
  open: boolean
  progress: MotionValue<number>
  /** O trecho da rolagem que pertence a esta parada. */
  range: [number, number]
  onSelect: () => void
}

/** Uma parada da visita: o título sempre à vista, o texto só na parada atual, e um fio que enche com a rolagem. */
function TourStop({ title, body, open, progress, range, onSelect }: TourStopProps) {
  const fill = useTransform(progress, range, [0, 1], { clamp: true })

  return (
    <li className="relative border-t border-edge py-6">
      <motion.span aria-hidden className="absolute inset-x-0 -top-px h-px origin-left bg-text" style={{ scaleX: fill }} />
      <button
        type="button"
        onClick={onSelect}
        aria-current={open ? 'step' : undefined}
        className={cn('block w-full rounded-sm text-left font-display text-xl font-semibold', open ? 'text-text' : 'text-text-off hover:text-text-2')}
      >
        {title}
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.p
            key="body"
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="max-w-[44ch] overflow-hidden text-base text-text-2"
          >
            <span className="block pt-3">{body}</span>
          </motion.p>
        ) : null}
      </AnimatePresence>
    </li>
  )
}

const BANKS: BankRef[] = [
  { id: 'nubank', name: 'Nubank' },
  { id: 'inter', name: 'Inter' },
  { id: 'picpay', name: 'PicPay' },
]

const VAULTS = [
  { icon: <AppleLogoIcon size={20} />, system: 'macOS', vault: 'Keychain' },
  { icon: <WindowsLogoIcon size={20} />, system: 'Windows', vault: 'DPAPI' },
  { icon: <LinuxLogoIcon size={20} />, system: 'Linux', vault: 'Chaveiro' },
]

const AGENT_TOOLS = ['resumo_do_mes', 'listar_transacoes', 'listar_previsoes', 'fila_de_conciliacao']

/** O que o projeto garante, em ladrilhos de tamanhos diferentes: cada um mostra a própria prova. */
function Facts() {
  return (
    <motion.section variants={staggerVariants} {...inView} className="mt-24 md:mt-32">
      <motion.h2 variants={itemVariants} className={HEADING}>
        Feito para ficar com você
      </motion.h2>
      <div className="mt-8 grid gap-6 lg:grid-cols-12">
        <Fact className="lg:col-span-7" title="Nada sai da sua máquina" detail="Banco SQLite local, sem login e sem hospedagem. O servidor só atende o seu próprio computador.">
          <p className="font-display text-2xl font-semibold tracking-[-0.03em] text-text-off md:text-hero" aria-hidden>
            127.0.0.1
          </p>
        </Fact>
        <Fact className="lg:col-span-5" title="Open Finance sem mensalidade" detail="Pelo MeuPluggy, o acesso aos dados dos seus próprios bancos é gratuito.">
          <ul className="flex gap-3" aria-label="Bancos com selo próprio no aplicativo">
            {BANKS.map((bank) => (
              <li key={bank.id} title={bank.name}>
                <BankLogo bank={bank} size="lg" />
                <span className="sr-only">{bank.name}</span>
              </li>
            ))}
          </ul>
        </Fact>
        <Fact className="lg:col-span-5" title="Chaves no cofre do sistema" detail="As credenciais da Pluggy nunca voltam para o navegador.">
          <ul className="flex flex-col gap-2">
            {VAULTS.map(({ icon, system, vault }) => (
              <li key={system} className="flex items-center gap-3 text-base text-text-2">
                <span className="text-text">{icon}</span>
                {system}
                <span className="ml-auto text-text-3">{vault}</span>
              </li>
            ))}
          </ul>
        </Fact>
        <Fact className="lg:col-span-7" title="Seus agentes também leem" detail="Um servidor MCP embutido, com token, e somente leitura até você liberar a escrita.">
          <ul className="flex flex-wrap gap-2">
            {AGENT_TOOLS.map((tool) => (
              <li key={tool} className="surface-sunken rounded-full px-3 py-1 font-mono text-sm text-text-2">
                {tool}
              </li>
            ))}
          </ul>
        </Fact>
      </div>
      <motion.p variants={itemVariants} className="mt-6 max-w-[62ch] text-sm text-text-3">
        Código aberto, licença MIT. Nasceu no macOS; no Windows e no Linux o cofre é próprio e ainda tem pouca estrada.
      </motion.p>
    </motion.section>
  )
}

function Fact({ title, detail, className, children }: { title: string; detail: string; className?: string; children: ReactNode }) {
  return (
    <motion.article variants={itemVariants} className={cn('surface flex min-h-56 flex-col justify-between gap-8 rounded-lg p-6', className)}>
      {children}
      <div>
        <h3 className="text-lg font-semibold text-text">{title}</h3>
        <p className="mt-1 max-w-[48ch] text-base text-text-2">{detail}</p>
      </div>
    </motion.article>
  )
}

const EXAMPLES = ['1.200*6', '2.500/3', '-89,90!', '300']

/** O campo de previsão do aplicativo, com o analisador de verdade: o que aparece aqui é o que seria criado. */
function ExpressionPlayground() {
  const [expression, setExpression] = useState('1.200*6')
  const month = todayIso().slice(0, 7)

  let preview: string | null = null
  let problem: string | null = null
  try {
    preview = describePlan(parseForecastExpression(expression), month)
  } catch (error) {
    if (error instanceof ForecastExpressionError && error.code !== 'empty') problem = error.message
  }

  return (
    <div className="surface grid gap-x-12 gap-y-6 rounded-lg p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:p-8">
      <div className="flex min-w-0 flex-col gap-3">
        <TextField
          label="Experimente uma previsão"
          typed
          inputMode="text"
          autoComplete="off"
          spellCheck={false}
          value={expression}
          onChange={(event) => setExpression(event.target.value)}
          error={problem ?? undefined}
        />
        <div className="flex flex-wrap gap-2">
          {EXAMPLES.map((example) => (
            <Button key={example} size="sm" aria-pressed={expression === example} onClick={() => setExpression(example)}>
              {example}
            </Button>
          ))}
        </div>
      </div>
      <div className="min-h-24 min-w-0" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={preview ?? 'vazio'}
            variants={swapVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className={cn('max-w-[30ch] font-display text-xl font-semibold text-balance', preview ? 'text-text' : 'text-text-off')}
          >
            {preview ?? 'Digite um valor para ver o que seria criado.'}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}

/** Os comandos para rodar o projeto, prontos para copiar. */
function InstallCommands() {
  const notify = useToast()
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL.join('\n'))
      setCopied(true)
    } catch {
      notify('Não consegui copiar. Selecione os comandos e copie à mão.', 'error')
    }
  }

  return (
    <div className="surface rounded-lg p-6">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-lg font-semibold text-text">No terminal</h3>
        <Button size="sm" onClick={() => void copy()} icon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span key={String(copied)} variants={swapVariants} initial="initial" animate="enter" exit="exit">
              {copied ? 'Copiado' : 'Copiar'}
            </motion.span>
          </AnimatePresence>
        </Button>
      </div>
      <pre className="surface-sunken mt-4 overflow-x-auto rounded-md px-4 py-3 font-mono text-sm leading-6 text-text-2">
        <code>{INSTALL.join('\n')}</code>
      </pre>
      <p className="mt-4 text-sm text-text-3">Depois abra http://localhost:5173 no navegador.</p>
    </div>
  )
}
