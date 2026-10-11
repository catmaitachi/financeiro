import { ArrowRightIcon, GithubLogoIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
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
/** O "agora" fica a dois terços da largura: o terço da direita é o futuro, onde aparecem as previsões. */
const NOW_AT = 2 / 3
/** Faixa de baixo reservada às barras de volume. */
const VOLUME_BAND = 64
/** Um compasso do pregão. A cada três: aparece a previsão, ela se sustenta, e o salto é sorteado. */
const BEAT_MS = 800
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
        className="relative z-(--z-content) mx-auto flex w-full max-w-[1180px] flex-col items-center px-4 pt-16 text-center md:px-6 md:pt-24"
      >
        <motion.h1
          variants={itemVariants}
          className="max-w-[22ch] text-2xl font-semibold tracking-[-0.03em] text-balance text-text lg:text-display"
        >
          O seu painel financeiro
        </motion.h1>
        <motion.p variants={itemVariants} className="mt-6 max-w-[52ch] text-md text-balance text-text-2">
          Contas e cartões chegam pelo Open Finance para um painel que roda só na sua máquina, com cada compra no mês da
          fatura.
        </motion.p>
        <motion.div variants={itemVariants} className="mt-8 flex flex-wrap items-center justify-center gap-3">
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

type Direction = 'up' | 'down'

/** As duas apostas para o próximo salto, e a chance de a de alta ser a sorteada. */
interface Forecast {
  id: number
  up: number
  down: number
  upOdds: number
}

interface Market {
  candles: Candle[]
  forecast: Forecast | null
  /** Para que lado foi o último sorteio: a aposta vencedora demora mais a sumir. */
  picked: Direction | null
}

const FORECAST_TONE: Record<Direction, string> = {
  up: 'fill-market-up stroke-market-up',
  down: 'fill-market-down stroke-market-down',
}

/**
 * O pregão. O "agora" fica a dois terços da largura, marcado por uma mira que
 * sobe e desce com o preço. Na casa seguinte aparecem duas velas-fantasma, uma
 * previsão de alta e uma de baixa para o próximo salto; uma delas é sorteada,
 * vira a vela de verdade, e o gráfico anda uma casa para a esquerda.
 */
function CandleChart({ still, running }: { still: boolean; running: boolean }) {
  const opening = useMemo(session, [])
  const box = useRef<HTMLDivElement>(null)
  const beats = useRef(-1)
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)

  // A escala de preço é fixa, calculada na abertura; as previsões nunca saem dela.
  const scale = useMemo(() => {
    const top = Math.max(...opening.map((candle) => candle.high)) + 36
    const bottom = Math.min(...opening.map((candle) => candle.low)) - 12
    return { top, bottom, center: bottom + (top - bottom) * 0.55 }
  }, [opening])

  const forecastFor = useMemo(
    () =>
      (last: Candle): Forecast => ({
        id: last.id,
        up: Math.min(scale.top - 16, last.close + 8 + Math.random() * 20),
        down: Math.max(scale.bottom + 16, last.close - 8 - Math.random() * 20),
        // Quanto mais longe do meio da escala, maior a chance de o sorteio trazer o preço de volta.
        upOdds: Math.min(0.85, Math.max(0.15, 0.5 + (scale.center - last.close) / (scale.top - scale.bottom))),
      }),
    [scale],
  )

  const [market, setMarket] = useState<Market>(() => ({
    candles: opening,
    // Com "reduzir movimento" o pregão não corre: fica uma previsão parada, para a ideia continuar à vista.
    forecast: still ? forecastFor(opening[opening.length - 1]!) : null,
    picked: null,
  }))

  useEffect(() => {
    const element = box.current
    if (!element) return
    const observer = new ResizeObserver(([entry]) => {
      setSize({ width: entry!.contentRect.width, height: entry!.contentRect.height })
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!running) return
    const timer = setInterval(() => {
      // Aba em segundo plano não desenha: sem esta pausa, as velas que saem se acumulariam à espera da animação.
      if (document.hidden) return
      beats.current += 1
      const beat = ((beats.current % 3) + 3) % 3
      setMarket((current) => {
        const last = current.candles[current.candles.length - 1]!
        if (beat === 1) return { ...current, forecast: forecastFor(last), picked: null }
        if (beat !== 0 || !current.forecast) return current
        // O sorteio: uma das duas previsões vira a próxima vela.
        const picked: Direction = Math.random() < current.forecast.upOdds ? 'up' : 'down'
        const close = current.forecast[picked]
        const next: Candle = {
          id: last.id + 1,
          open: last.close,
          close,
          high: Math.max(last.close, close) + Math.random() * 7,
          low: Math.min(last.close, close) - Math.random() * 7,
          volume: 0.25 + Math.random() * 0.75,
        }
        return { candles: [...current.candles.slice(1), next], forecast: null, picked }
      })
    }, BEAT_MS)
    return () => clearInterval(timer)
  }, [running, forecastFor])

  const { candles, forecast, picked } = market
  const live = candles[candles.length - 1]!

  const chart = (() => {
    if (!size) return null
    const { width, height } = size
    const step = width < 640 ? 14 : 20
    const body = step / 2
    const now = Math.round(width * NOW_AT)
    const chartHeight = height - VOLUME_BAND
    const y = (price: number) => 16 + ((scale.top - price) / (scale.top - scale.bottom)) * (chartHeight - 32)
    const x = (index: number) => now - (candles.length - 1 - index) * step
    const liveY = y(live.close)
    const slide = { duration: SLIDE, ease: ease.out }
    const grow = { duration: 0.6, ease: ease.out }

    return (
      <svg width={width} height={height} className="block">
        {[0.2, 0.4, 0.6, 0.8].map((line) => (
          <line key={line} x1={0} x2={width} y1={chartHeight * line} y2={chartHeight * line} className="stroke-edge" strokeWidth={1} />
        ))}

        <AnimatePresence initial={!still}>
          {candles.map((candle, index) => {
            if (x(index) < -step) return null
            const up = candle.close >= candle.open
            // As velas da abertura entram em fila, da esquerda para a direita; as sorteadas nascem na casa da previsão.
            const born = candle.id >= CANDLES
            const delay = born ? 0 : 0.25 + Math.max(0, x(index) / step) * 0.016
            const bar = candle.volume * (VOLUME_BAND - 12)
            return (
              <motion.g
                key={candle.id}
                initial={{ opacity: born ? 1 : 0, x: born ? now + step : x(index) }}
                animate={{ opacity: 1, x: x(index) }}
                exit={{ opacity: 0, x: x(index) - step }}
                transition={{ x: slide, opacity: { duration: duration.layout, ease: ease.out, delay } }}
                className={up ? 'fill-market-up stroke-market-up' : 'fill-market-down stroke-market-down'}
              >
                <motion.line
                  x1={0}
                  x2={0}
                  strokeWidth={1.5}
                  initial={{ y1: y(candle.open), y2: y(candle.open) }}
                  animate={{ y1: y(candle.high), y2: y(candle.low) }}
                  transition={{ ...grow, delay }}
                />
                <motion.rect
                  x={-body / 2}
                  width={body}
                  rx={2}
                  stroke="none"
                  initial={{ y: y(candle.open), height: 2 }}
                  animate={{ y: y(Math.max(candle.open, candle.close)), height: Math.max(2, Math.abs(y(candle.open) - y(candle.close))) }}
                  transition={{ ...grow, delay }}
                />
                <motion.rect
                  x={-body / 2}
                  width={body}
                  stroke="none"
                  opacity={0.3}
                  initial={{ y: height, height: 0 }}
                  animate={{ y: height - bar, height: bar }}
                  transition={{ duration: duration.layout, ease: ease.out, delay }}
                />
              </motion.g>
            )
          })}
        </AnimatePresence>

        {/* As duas previsões para o próximo salto: duas velas-fantasma na casa seguinte. No sorteio, a que perde some na hora e a que vence se demora. */}
        <AnimatePresence custom={picked}>
          {forecast
            ? (['up', 'down'] as const).map((direction) => {
                const target = forecast[direction]
                const targetY = y(target)
                return (
                  <motion.g
                    key={`${forecast.id}-${direction}`}
                    custom={picked}
                    variants={{
                      initial: { opacity: 0 },
                      enter: { opacity: 1, transition: { duration: duration.state } },
                      exit: (winner: Direction | null) => ({
                        opacity: 0,
                        transition: { duration: winner === direction ? 0.6 : duration.feedback },
                      }),
                    }}
                    initial={still ? false : 'initial'}
                    animate="enter"
                    exit="exit"
                    className={FORECAST_TONE[direction]}
                  >
                    <rect
                      x={now + step - body / 2}
                      y={Math.min(liveY, targetY)}
                      width={body}
                      height={Math.max(2, Math.abs(targetY - liveY))}
                      rx={2}
                      fillOpacity={0.22}
                      strokeWidth={1}
                    />
                  </motion.g>
                )
              })
            : null}
        </AnimatePresence>

        {/* A mira do preço de agora: a vertical marca o presente, a horizontal sobe e desce com a bolsa. */}
        <line x1={now} x2={now} y1={0} y2={height} className="stroke-text-off" strokeWidth={1} />
        <motion.g initial={false} animate={{ y: liveY }} transition={still ? { duration: 0 } : grow}>
          <line x1={0} x2={width} y1={0} y2={0} className="stroke-text-off" strokeWidth={1} />
          {still ? null : (
            <motion.circle
              cx={now}
              cy={0}
              fill="none"
              className="stroke-text"
              strokeWidth={1.5}
              animate={{ r: [3, 14], opacity: [0.7, 0] }}
              transition={{ duration: 1.6, ease: 'easeOut', repeat: Infinity }}
            />
          )}
          <circle cx={now} cy={0} r={3} className="fill-text" />
        </motion.g>
      </svg>
    )
  })()

  return (
    <div ref={box} className="absolute inset-0">
      {chart}
    </div>
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
