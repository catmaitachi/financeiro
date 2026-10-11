import { ArrowRightIcon, CheckIcon, CopyIcon, GithubLogoIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useState, type ReactNode } from 'react'
import { ForecastExpressionError, parseForecastExpression } from '@shared/forecast-expression'
import { duration, ease, itemVariants, staggerVariants, swapVariants } from '@/design/motion'
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

/** A única entrada com coreografia própria: a tela do produto se revela de cima para baixo. */
const revealVariants: Variants = {
  initial: { opacity: 0, y: 24, clipPath: 'inset(0 0 100% 0 round 22px)' },
  enter: {
    opacity: 1,
    y: 0,
    clipPath: 'inset(0 0 0% 0 round 22px)',
    transition: { duration: duration.entrance, ease: ease.out, delay: 0.12 },
  },
}

const INSTALL = ['git clone https://github.com/catmaitachi/financeiro.git', 'cd financeiro', 'npm install', 'npm run dev']

const FACTS: [term: string, detail: string][] = [
  [
    'Nada sai da sua máquina',
    'Os dados ficam num banco SQLite local e o servidor só escuta em 127.0.0.1. Sem login, sem hospedagem, sem conta para criar.',
  ],
  [
    'Open Finance sem mensalidade',
    'O caminho padrão é o MeuPluggy, que dá acesso gratuito aos dados dos seus próprios bancos.',
  ],
  [
    'Chaves no cofre do sistema',
    'As credenciais da Pluggy vão para o Keychain no macOS, para a DPAPI no Windows e para o chaveiro no Linux. O navegador nunca as recebe de volta.',
  ],
  [
    'Seus agentes também leem',
    'Um servidor MCP embutido entrega os dados a agentes como o Claude, com token e somente leitura até você liberar a escrita.',
  ],
  [
    'Um comando para rodar',
    'Node.js 24 e nada para compilar. Nasceu no macOS; no Windows e no Linux o cofre é próprio e ainda tem pouca estrada.',
  ],
  ['Código aberto', 'Licença MIT. Leia, mude e rode do seu jeito.'],
]

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
        <section className="pt-12 md:pt-16">
          <motion.div variants={staggerVariants} initial="initial" animate="enter" className="flex flex-col items-start">
            <motion.h1
              variants={itemVariants}
              className="max-w-[26ch] text-2xl font-semibold tracking-[-0.03em] text-balance text-text lg:text-display"
            >
              Seu dinheiro, num painel que roda só na sua máquina.
            </motion.h1>
            <motion.p variants={itemVariants} className="mt-6 max-w-[56ch] text-md text-text-2">
              O Financeiro junta as contas e os cartões dos seus bancos pelo Open Finance, conta cada compra no mês da
              fatura e dá baixa sozinho no que você previu receber ou pagar.
            </motion.p>
            <motion.div variants={itemVariants} className="mt-8 flex flex-wrap items-center gap-3">
              <AnchorButton variant="primary" href={DEMO_URL} icon={<ArrowRightIcon />} className="flex-row-reverse">
                Abrir a demonstração
              </AnchorButton>
              <AnchorButton href={REPOSITORY_URL} icon={<GithubLogoIcon />}>
                Ver o código no GitHub
              </AnchorButton>
            </motion.div>
            <motion.p variants={itemVariants} className="mt-4 max-w-[56ch] text-sm text-text-3">
              A demonstração é o aplicativo de verdade rodando inteiro no seu navegador, com bancos e lançamentos
              fictícios. Nada é enviado a servidor nenhum.
            </motion.p>
          </motion.div>

          <motion.a
            href={DEMO_URL}
            variants={revealVariants}
            initial="initial"
            animate="enter"
            aria-label="Abrir a demonstração no Painel"
            className="group surface mt-12 block overflow-hidden rounded-lg p-2"
          >
            <img
              src={dashboardShot}
              width={1920}
              height={1200}
              alt="Painel do Financeiro: faturas do mês por banco, previsão de entradas, últimas transações e saldo em contas"
              className="w-full rounded-md transition-transform duration-(--dur-layout) ease-out group-hover:scale-[1.01]"
            />
          </motion.a>

          <motion.div
            variants={staggerVariants}
            initial="initial"
            whileInView="enter"
            viewport={{ once: true, margin: '-80px' }}
            className="mt-8 grid gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
          >
            <motion.h2 variants={itemVariants} className="max-w-[18ch] text-xl font-semibold text-balance text-text md:text-2xl">
              Cada compra no mês da fatura
            </motion.h2>
            <motion.div variants={itemVariants} className="flex max-w-[62ch] flex-col gap-3 text-base text-text-2">
              <p>
                O Painel mostra quanto falta pagar de fatura, quanto está previsto para entrar e se uma coisa cobre a
                outra. Cada banco traz a fatura atual, se já foi paga ou quando vence, e o que já caiu na fatura seguinte.
              </p>
              <p>Abaixo ficam as últimas transações e o saldo em contas depois das faturas a pagar.</p>
            </motion.div>
          </motion.div>
        </section>

        <Tour
          title="Todos os bancos numa linha do tempo"
          image={transactionsShot}
          alt="Lista de transações agrupada por dia, com busca e filtros por banco, período e categoria"
          flip
        >
          <p>
            As transações de todos os bancos ficam juntas, da mais recente para a mais antiga, com filtro por banco,
            período, categoria e direção.
          </p>
          <p>
            Pagamentos de fatura e transferências entre as suas próprias contas ficam fora dos totais, para o mesmo
            dinheiro não entrar duas vezes.
          </p>
        </Tour>

        <Tour
          title="Previsão que se escreve como uma conta"
          image={forecastsShot}
          alt="Tela de previsões com saldo previsto, formulário de nova previsão e a lista de entradas por mês"
        >
          <p>
            Uma previsão é uma expressão curta. Quando o dinheiro chega ao banco, o Financeiro dá a baixa sozinho, e o
            que for ambíguo vai para uma fila de revisão.
          </p>
          <ExpressionPlayground />
        </Tour>

        <Tour
          title="Cada banco, e o que ele pede de você"
          image={connectionsShot}
          alt="Tela de conexões com os bancos conectados, o estado de cada sincronização e os ajustes de acesso"
          flip
        >
          <p>
            Em Conexões você vê cada banco, quando foi a última sincronização e o que precisa da sua atenção, como uma
            conexão aguardando confirmação.
          </p>
        </Tour>

        <motion.section
          variants={staggerVariants}
          initial="initial"
          whileInView="enter"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-24 md:mt-32"
        >
          <motion.h2 variants={itemVariants} className="max-w-[20ch] text-xl font-semibold text-balance text-text md:text-2xl">
            Feito para ficar com você
          </motion.h2>
          <dl className="mt-8 border-t border-edge">
            {FACTS.map(([term, detail]) => (
              <motion.div
                key={term}
                variants={itemVariants}
                className="grid gap-x-8 gap-y-1 border-b border-edge py-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:py-6"
              >
                <dt className="text-md font-medium text-text">{term}</dt>
                <dd className="max-w-[62ch] text-base text-text-2">{detail}</dd>
              </motion.div>
            ))}
          </dl>
        </motion.section>

        <motion.section
          variants={staggerVariants}
          initial="initial"
          whileInView="enter"
          viewport={{ once: true, margin: '-80px' }}
          className="mt-24 grid items-start gap-x-12 gap-y-8 md:mt-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
        >
          <motion.div variants={itemVariants} className="flex min-w-0 flex-col items-start gap-4">
            <h2 className="text-xl font-semibold text-balance text-text md:text-2xl">Rode com os seus bancos</h2>
            <p className="max-w-[48ch] text-base text-text-2">
              Você precisa do Node.js 24 ou mais novo. No primeiro acesso, o aplicativo pede as chaves da sua Application
              na Pluggy e testa o par antes de guardar.
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

interface TourProps {
  title: string
  image: string
  alt: string
  /** Texto à direita, tela à esquerda. */
  flip?: boolean
  children: ReactNode
}

/** Uma parada da visita: o que a tela faz, ao lado da própria tela. */
function Tour({ title, image, alt, flip = false, children }: TourProps) {
  return (
    <motion.section
      variants={staggerVariants}
      initial="initial"
      whileInView="enter"
      viewport={{ once: true, margin: '-80px' }}
      className="mt-24 grid items-center gap-x-12 gap-y-8 md:mt-32 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]"
    >
      <motion.div variants={itemVariants} className={cn('flex min-w-0 flex-col gap-4', flip && 'lg:order-2')}>
        <h2 className="max-w-[18ch] text-xl font-semibold text-balance text-text md:text-2xl">{title}</h2>
        <div className="flex max-w-[48ch] flex-col gap-3 text-base text-text-2">{children}</div>
      </motion.div>
      <motion.div variants={itemVariants} className="surface min-w-0 overflow-hidden rounded-lg p-2">
        <img
          src={image}
          alt={alt}
          loading="lazy"
          width={1920}
          height={1200}
          className="aspect-[16/11] w-full rounded-md object-cover object-top"
        />
      </motion.div>
    </motion.section>
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
    <div className="mt-1 flex flex-col gap-3">
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
      <div className="surface-sunken min-h-16 rounded-md px-4 py-3" aria-live="polite">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={preview ?? 'vazio'}
            variants={swapVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className={preview ? 'text-base text-text' : 'text-base text-text-3'}
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
