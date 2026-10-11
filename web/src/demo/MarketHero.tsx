import { ArrowRightIcon, GithubLogoIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import { duration, ease, itemVariants, staggerVariants } from '@/design/motion'
import { DEMO_APP_BASE, REPOSITORY_URL } from '@/lib/demo'
import { AnchorButton } from '@/ui/Button'

const DEMO_URL = `${DEMO_APP_BASE}/`

interface Candle {
  /** Ordem de abertura: identifica a vela enquanto ela atravessa o gráfico. */
  id: number
  open: number
  close: number
  high: number
  low: number
  /** De 0 a 1: a altura da barra de volume. */
  volume: number
}

const CANDLES = 64
const STEP = 20
const BODY = 10
const WIDTH = CANDLES * STEP
const HEIGHT = 420
/** Faixa de baixo reservada às barras de volume. */
const VOLUME_BAND = 64
/** A cada quantos milissegundos o preço se mexe, e a cada quantas mexidas a vela fecha e abre outra. */
const TICK_MS = 700
const TICKS_PER_CANDLE = 3
const SLIDE = 0.7

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
  for (let id = 0; id < CANDLES; id++) {
    const drift = 0.9 + Math.sin(id / 7) * 2.2
    const open = price
    const close = Math.max(40, open + (random() - 0.46) * 22 + drift)
    candles.push({
      id,
      open,
      close,
      high: Math.max(open, close) + random() * 9,
      low: Math.min(open, close) - random() * 9,
      volume: 0.25 + random() * 0.75,
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

interface MarketHeroProps {
  /** Avisa quando a abertura entra ou sai da janela; o cabeçalho da página só aparece depois que ela sai. */
  onVisibilityChange?: (visible: boolean) => void
}

/**
 * A abertura da página: o seu dinheiro lido como um pregão. O gráfico de
 * velas se desenha ao carregar e continua correndo como um mercado aberto, e
 * a fita embaixo passa o que o aplicativo acompanha.
 */
export function MarketHero({ onVisibilityChange }: MarketHeroProps) {
  const hero = useRef<HTMLElement>(null)
  const still = useReducedMotion() ?? false
  const [visible, setVisible] = useState(true)
  const { scrollYProgress } = useScroll({ target: hero, offset: ['start start', 'end start'] })
  // Ao rolar, o texto sobe mais rápido que o gráfico: o pregão fica para trás, em segundo plano.
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -72])
  const chartY = useTransform(scrollYProgress, [0, 1], [0, 96])
  const chartOpacity = useTransform(scrollYProgress, [0, 0.9], [1, 0.15])

  useEffect(() => {
    const element = hero.current
    if (!element) return
    // A margem de cima é a altura do cabeçalho: ele entra quando a abertura já passou por baixo dele.
    const observer = new IntersectionObserver(
      ([entry]) => {
        setVisible(entry!.isIntersecting)
        onVisibilityChange?.(entry!.isIntersecting)
      },
      { rootMargin: '-80px 0px 0px 0px' },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [onVisibilityChange])

  return (
    <section ref={hero} className="relative flex min-h-dvh flex-col overflow-hidden">
      <motion.div
        variants={staggerVariants}
        initial="initial"
        animate="enter"
        style={still ? undefined : { y: copyY }}
        className="relative z-(--z-content) mx-auto flex w-full max-w-[1180px] flex-col items-start px-4 pt-8 md:px-6"
      >
        <motion.p variants={itemVariants} className="font-display text-lg font-semibold text-text">
          Financeiro
        </motion.p>
        <motion.h1
          variants={itemVariants}
          className="mt-12 max-w-[22ch] text-2xl font-semibold tracking-[-0.03em] text-balance text-text md:mt-16 lg:text-display"
        >
          O seu painel financeiro
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
        className="relative mt-8 min-h-64 flex-1 [mask-image:linear-gradient(to_bottom,black_82%,transparent)]"
      >
        <CandleChart still={still} running={visible && !still} />
      </motion.div>

      <Tape />
    </section>
  )
}

/**
 * O pregão. Depois de se desenhar, ele corre: o preço se mexe a cada instante,
 * a vela da ponta fecha, outra abre e o gráfico inteiro anda uma casa para a
 * esquerda. O ponteiro ganha uma mira, como numa tela de corretora.
 */
function CandleChart({ still, running }: { still: boolean; running: boolean }) {
  const opening = useMemo(session, [])
  const [candles, setCandles] = useState(opening)
  const random = useRef(seeded(7))
  const ticks = useRef(0)
  const svg = useRef<SVGSVGElement>(null)
  const aimX = useMotionValue(0)
  const aimY = useMotionValue(0)
  const aimOpacity = useMotionValue(0)

  // A escala de preço é fixa, calculada na abertura; o preço novo é puxado de volta para o meio dela.
  const scale = useMemo(() => {
    const top = Math.max(...opening.map((candle) => candle.high)) + 36
    const bottom = Math.min(...opening.map((candle) => candle.low)) - 12
    return { top, bottom, center: bottom + (top - bottom) * 0.6 }
  }, [opening])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      // Aba em segundo plano não desenha: sem esta pausa, as velas que saem se acumulariam à espera da animação.
      if (document.hidden) return
      ticks.current += 1
      const closing = ticks.current % TICKS_PER_CANDLE === 0
      const noise = (random.current() - 0.5) * 16
      const volume = 0.25 + random.current() * 0.75
      setCandles((current) => {
        const last = current[current.length - 1]!
        const pulled = last.close + noise + (scale.center - last.close) * 0.07
        const close = Math.min(scale.top - 16, Math.max(scale.bottom + 16, pulled))
        const moved = { ...last, close, high: Math.max(last.high, close), low: Math.min(last.low, close) }
        if (!closing) return [...current.slice(0, -1), moved]
        // A vela nova nasce chata, no preço em que a anterior fechou, e cresce nas mexidas seguintes.
        const next = { id: last.id + 1, open: close, close, high: close, low: close, volume }
        return [...current.slice(1, -1), moved, next]
      })
    }, TICK_MS)
    return () => clearInterval(timer)
  }, [running, scale])

  const chartHeight = HEIGHT - VOLUME_BAND
  const y = (price: number) => 16 + ((scale.top - price) / (scale.top - scale.bottom)) * (chartHeight - 32)
  const x = (index: number) => index * STEP + STEP / 2
  const firstId = candles[0]!.id
  const live = candles[candles.length - 1]!

  // Média móvel de cinco velas: a linha que resume a direção.
  const average = candles
    .map((_, index) => {
      const window = candles.slice(Math.max(0, index - 4), index + 1)
      return `${index === 0 ? 'M' : 'L'}${x(index)} ${y(window.reduce((sum, candle) => sum + candle.close, 0) / window.length)}`
    })
    .join(' ')

  const aim = (event: PointerEvent<SVGSVGElement>) => {
    const matrix = svg.current?.getScreenCTM()
    if (!matrix) return
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse())
    aimX.set(point.x)
    aimY.set(point.y)
    aimOpacity.set(1)
  }

  const slide = { duration: SLIDE, ease: ease.out }
  const tick = { duration: TICK_MS / 1000, ease: ease.inOut }

  return (
    // `slice` ancorado à direita: em telas estreitas somem as velas antigas, nunca a última.
    <svg
      ref={svg}
      viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      preserveAspectRatio="xMaxYMid slice"
      className="absolute inset-0 size-full"
      onPointerMove={still ? undefined : aim}
      onPointerLeave={() => aimOpacity.set(0)}
    >
      {[0.2, 0.4, 0.6, 0.8].map((line) => (
        <line key={line} x1={0} x2={WIDTH} y1={chartHeight * line} y2={chartHeight * line} className="stroke-edge" strokeWidth={1} vectorEffect="non-scaling-stroke" />
      ))}

      <AnimatePresence initial={!still}>
        {candles.map((candle, index) => {
          const up = candle.close >= candle.open
          // Só as velas da abertura entram em fila; as que nascem depois aparecem na hora.
          const delay = candle.id < CANDLES ? 0.25 + candle.id * 0.016 : 0
          const bar = candle.volume * (VOLUME_BAND - 12)
          return (
            <motion.g
              key={candle.id}
              initial={{ opacity: 0, x: x(index) }}
              animate={{ opacity: 1, x: x(index) }}
              exit={{ opacity: 0, x: x(index - 1) }}
              transition={{ x: slide, opacity: { duration: duration.layout, ease: ease.out, delay } }}
              className={up ? 'fill-market-up stroke-market-up' : 'fill-market-down stroke-market-down'}
            >
              <motion.line
                x1={0}
                x2={0}
                strokeWidth={1.5}
                initial={{ y1: y(candle.open), y2: y(candle.open) }}
                animate={{ y1: y(candle.high), y2: y(candle.low) }}
                transition={{ ...tick, delay }}
              />
              <motion.rect
                x={-BODY / 2}
                width={BODY}
                rx={2}
                stroke="none"
                initial={{ y: y(candle.open), height: 2 }}
                animate={{ y: y(Math.max(candle.open, candle.close)), height: Math.max(2, Math.abs(y(candle.open) - y(candle.close))) }}
                transition={{ ...tick, delay }}
              />
              <motion.rect
                x={-BODY / 2}
                width={BODY}
                stroke="none"
                opacity={0.3}
                initial={{ y: HEIGHT, height: 0 }}
                animate={{ y: HEIGHT - bar, height: bar }}
                transition={{ duration: duration.layout, ease: ease.out, delay }}
              />
            </motion.g>
          )
        })}
      </AnimatePresence>

      {/* A linha do preço de agora: acompanha a última vela, com um ponto que pulsa na ponta. */}
      <motion.line
        x1={0}
        x2={WIDTH}
        className="stroke-text-off"
        strokeWidth={1}
        strokeDasharray="4 6"
        vectorEffect="non-scaling-stroke"
        initial={false}
        animate={{ y1: y(live.close), y2: y(live.close) }}
        transition={tick}
      />
      <motion.g initial={false} animate={{ y: y(live.close) }} transition={tick}>
        {still ? null : (
          <motion.circle
            cx={x(CANDLES - 1)}
            cy={0}
            fill="none"
            className="stroke-text"
            strokeWidth={1.5}
            animate={{ r: [3, 14], opacity: [0.7, 0] }}
            transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
          />
        )}
        <circle cx={x(CANDLES - 1)} cy={0} r={3} className="fill-text" />
      </motion.g>

      {/* Refeita a cada vela que abre, já uma casa à direita, para deslizar junto com as velas em vez de ondular. */}
      <motion.g key={firstId} initial={firstId === 0 ? false : { x: STEP }} animate={{ x: 0 }} transition={slide}>
        <motion.path
          fill="none"
          className="stroke-text-2"
          strokeWidth={1.5}
          strokeLinejoin="round"
          initial={firstId === 0 && !still ? { d: average, pathLength: 0, opacity: 0 } : { d: average, pathLength: 1, opacity: 1 }}
          animate={{ d: average, pathLength: 1, opacity: 1 }}
          transition={{ d: tick, pathLength: { duration: 1.6, ease: ease.inOut, delay: 0.5 }, opacity: { duration: duration.state, delay: 0.5 } }}
        />
      </motion.g>

      <motion.g style={{ opacity: aimOpacity }} className="stroke-text-3" strokeWidth={1} pointerEvents="none">
        <motion.line x1={aimX} x2={aimX} y1={0} y2={HEIGHT} vectorEffect="non-scaling-stroke" />
        <motion.line x1={0} x2={WIDTH} y1={aimY} y2={aimY} vectorEffect="non-scaling-stroke" />
      </motion.g>
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
