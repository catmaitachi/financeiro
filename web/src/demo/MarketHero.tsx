import { ArrowRightIcon, GithubLogoIcon } from '@phosphor-icons/react'
import { motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { duration, ease, itemVariants, staggerVariants } from '@/design/motion'
import { DEMO_APP_BASE, REPOSITORY_URL } from '@/lib/demo'
import { AnchorButton } from '@/ui/Button'

const DEMO_URL = `${DEMO_APP_BASE}/`

interface Candle {
  open: number
  close: number
  high: number
  low: number
}

const CANDLES = 64
const STEP = 20
const BODY = 10
const WIDTH = CANDLES * STEP
const HEIGHT = 420

/** Gerador com semente (mulberry32): o pregão do hero é o mesmo a cada visita. */
function seeded(seed: number) {
  let state = seed
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Um pregão inventado: sobe e desce, mas fecha em alta. É cenário, não dado de ninguém. */
function session(): Candle[] {
  const random = seeded(20261011)
  const candles: Candle[] = []
  let price = 96
  for (let i = 0; i < CANDLES; i++) {
    const drift = 0.9 + Math.sin(i / 7) * 2.2
    const open = price
    const close = Math.max(40, open + (random() - 0.46) * 22 + drift)
    candles.push({
      open,
      close,
      high: Math.max(open, close) + random() * 9,
      low: Math.min(open, close) - random() * 9,
    })
    price = close
  }
  return candles
}

/** O que o Financeiro acompanha, dito como uma fita de cotações. Valores da demonstração. */
const TAPE: { label: string; value: string; up: boolean }[] = [
  { label: 'Faturas do mês', value: 'R$ 1.651,48', up: false },
  { label: 'Previsão de entradas', value: 'R$ 2.033,34', up: true },
  { label: 'Saldo em contas', value: 'R$ 28.313,27', up: true },
  { label: 'Banco Aurora', value: 'R$ 1.192,43', up: false },
  { label: 'Cartões Solar', value: 'R$ 459,05', up: false },
  { label: 'A receber', value: 'R$ 8.530,00', up: true },
  { label: 'Sobra depois das faturas', value: 'R$ 1.574,29', up: true },
]

/**
 * A abertura da página: o seu dinheiro lido como um pregão. O gráfico de
 * velas se desenha ao carregar, a última vela continua oscilando como um
 * mercado aberto, e a fita embaixo passa o que o aplicativo acompanha.
 */
export function MarketHero() {
  const hero = useRef<HTMLElement>(null)
  const still = useReducedMotion() ?? false
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  // Ao rolar, o texto sobe mais rápido que o gráfico: o pregão fica para trás, em segundo plano.
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -72])
  const chartY = useTransform(scrollYProgress, [0, 1], [0, 96])
  const chartOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.15])

  return (
    <section ref={hero} className="relative flex min-h-[calc(100dvh-5rem)] flex-col overflow-hidden">
      <motion.div
        variants={staggerVariants}
        initial="initial"
        animate="enter"
        style={still ? undefined : { y: copyY }}
        className="relative z-(--z-content) mx-auto flex w-full max-w-[1180px] flex-col items-start px-4 pt-12 md:px-6 md:pt-16"
      >
        <motion.h1
          variants={itemVariants}
          className="max-w-[22ch] text-2xl font-semibold tracking-[-0.03em] text-balance text-text lg:text-display"
        >
          O seu dinheiro também tem pregão.
        </motion.h1>
        <motion.p variants={itemVariants} className="mt-6 max-w-[52ch] text-md text-text-2">
          Contas e cartões chegam pelo Open Finance para um painel que roda só na sua máquina, com cada compra no mês da
          fatura.
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

      <motion.div
        aria-hidden
        style={still ? undefined : { y: chartY, opacity: chartOpacity }}
        className="relative mt-8 min-h-56 flex-1 [mask-image:linear-gradient(to_bottom,black_60%,transparent)]"
      >
        <CandleChart still={still} />
      </motion.div>

      <Tape />
    </section>
  )
}

function CandleChart({ still }: { still: boolean }) {
  const candles = useMemo(session, [])
  const [live, setLive] = useState(candles[CANDLES - 1]!.close)

  // A última vela é o "agora": oscila em torno do fechamento, como um mercado ainda aberto.
  useEffect(() => {
    if (still) return
    const base = candles[CANDLES - 1]!.close
    const random = seeded(7)
    const timer = setInterval(() => setLive(base + (random() - 0.4) * 18), 1400)
    return () => clearInterval(timer)
  }, [candles, still])

  const series = useMemo(
    () => candles.map((candle, index) => (index === CANDLES - 1 ? { ...candle, close: live, high: Math.max(candle.high, live), low: Math.min(candle.low, live) } : candle)),
    [candles, live],
  )

  const top = Math.max(...candles.map((candle) => candle.high)) + 14
  const bottom = Math.min(...candles.map((candle) => candle.low)) - 14
  const y = (price: number) => ((top - price) / (top - bottom)) * HEIGHT
  const x = (index: number) => index * STEP + STEP / 2

  // Média móvel de cinco velas: a linha que resume a direção.
  const average = candles
    .map((_, index) => {
      const window = candles.slice(Math.max(0, index - 4), index + 1)
      return `${index === 0 ? 'M' : 'L'}${x(index)} ${y(window.reduce((sum, candle) => sum + candle.close, 0) / window.length)}`
    })
    .join(' ')

  return (
    // `slice` ancorado à direita: em telas estreitas somem as velas antigas, nunca a última.
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="xMaxYMid slice" className="absolute inset-0 size-full">
      {[0.2, 0.4, 0.6, 0.8].map((line) => (
        <line key={line} x1={0} x2={WIDTH} y1={HEIGHT * line} y2={HEIGHT * line} className="stroke-edge" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}

      {series.map((candle, index) => {
        const up = candle.close >= candle.open
        const bodyTop = y(Math.max(candle.open, candle.close))
        const bodyHeight = Math.max(2, Math.abs(y(candle.open) - y(candle.close)))
        const last = index === CANDLES - 1
        return (
          <motion.g
            key={index}
            initial={still ? false : { opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            transition={{ duration: duration.layout, ease: ease.out, delay: 0.25 + index * 0.016 }}
            style={{ transformBox: 'fill-box', transformOrigin: '50% 50%' }}
            className={up ? 'fill-market-up stroke-market-up' : 'fill-market-down stroke-market-down'}
          >
            <line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)} strokeWidth={1.5} />
            <motion.rect
              x={x(index) - BODY / 2}
              width={BODY}
              rx={2}
              stroke="none"
              initial={false}
              animate={{ y: bodyTop, height: bodyHeight }}
              transition={last ? { duration: 0.9, ease: ease.inOut } : { duration: 0 }}
            />
          </motion.g>
        )
      })}

      {/* A linha do preço de agora: acompanha a última vela. */}
      <motion.line
        x1={0}
        x2={WIDTH}
        className="stroke-text-off"
        strokeWidth={1}
        strokeDasharray="4 6"
        vectorEffect="non-scaling-stroke"
        initial={false}
        animate={{ y1: y(live), y2: y(live) }}
        transition={{ duration: 0.9, ease: ease.inOut }}
      />

      <motion.path
        d={average}
        fill="none"
        className="stroke-text-2"
        strokeWidth={1.5}
        strokeLinejoin="round"
        initial={still ? false : { pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 1.6, ease: ease.inOut, delay: 0.5 }}
      />
    </svg>
  )
}

/** A fita de cotações. Roda devagar, para ao passar o ponteiro, e fica parada com "reduzir movimento". */
function Tape() {
  const row = (hidden: boolean) => (
    <ul aria-hidden={hidden || undefined} className="flex shrink-0 items-center">
      {TAPE.map((quote) => (
        <li key={quote.label} className="flex items-center gap-2 px-6 text-base whitespace-nowrap">
          <span className="text-text-3">{quote.label}</span>
          <span className={quote.up ? 'text-market-up' : 'text-market-down'} aria-hidden>
            {quote.up ? '▲' : '▼'}
          </span>
          <span className="tabular font-medium text-text">{quote.value}</span>
          <span className="sr-only">{quote.up ? ', entrada' : ', saída'}</span>
        </li>
      ))}
    </ul>
  )

  return (
    <div className="relative z-(--z-content) overflow-hidden border-y border-edge bg-glass-clear py-3" aria-label="O que o Financeiro acompanha, com valores da demonstração">
      <div className="ticker flex w-max">
        {row(false)}
        {row(true)}
      </div>
    </div>
  )
}
