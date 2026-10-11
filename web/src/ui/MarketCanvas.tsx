import { useEffect, useRef } from 'react'
import { financialGlyph, financialGlyphTone, type BackgroundVariant } from './background-options'
import { createFrameScheduler } from './background-runtime'

interface MarketCanvasProps {
  variant: BackgroundVariant
  paused: boolean
}

interface Cell {
  x: number
  y: number
  glyph: string
  alpha: number
}

const FRAME_MS = 1000 / 12

interface TickerRow {
  tone: 'up' | 'down'
  text: string
  speed: number
  alpha: number
}

/** Cotação abstrata no formato pt-BR, sem relação com dados reais. */
function randomQuote(tone: 'up' | 'down'): string {
  const price = (10 + Math.random() * 1400).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const change = (Math.random() * 0.9).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return `${price}  ${tone === 'up' ? '▲' : '▼'} ${change}%`
}

function buildTickerRow(): TickerRow {
  const tone = Math.random() < 0.55 ? 'up' : 'down'
  const quotes = Array.from({ length: 7 }, () => randomQuote(Math.random() < 0.7 ? tone : tone === 'up' ? 'down' : 'up'))
  return { tone, text: quotes.join('     '), speed: 0.006 + Math.random() * 0.01, alpha: 0.26 + Math.random() * 0.24 }
}

/** Canvas decorativo de baixo custo: nenhum dado real ou interativo vive aqui. */
export function MarketCanvas({ variant, paused }: MarketCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const context = canvas.getContext('2d')
    if (!context) return

    let width = 1
    let height = 1
    let lastMutation = 0
    let cells: Cell[] = []
    let rows: TickerRow[] = []
    const rootStyle = getComputedStyle(document.documentElement)
    const mark = rootStyle.getPropertyValue('--color-market-mark').trim()
    const mid = rootStyle.getPropertyValue('--color-market-mid').trim()
    const up = rootStyle.getPropertyValue('--market-up').trim()
    const down = rootStyle.getPropertyValue('--market-down').trim()

    const rebuild = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 1.25)
      width = Math.max(1, canvas.clientWidth)
      height = Math.max(1, canvas.clientHeight)
      canvas.width = Math.round(width * ratio)
      canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)

      cells = []
      const gap = width < 640 ? 24 : 28
      for (let y = gap; y < height; y += gap) {
        for (let x = gap / 2; x < width; x += gap) {
          if (Math.random() > 0.54) continue
          cells.push({ x, y, glyph: financialGlyph(Math.random()), alpha: 0.36 + Math.random() * 0.48 })
        }
      }

      const rowGap = width < 640 ? 30 : 34
      rows = Array.from({ length: Math.max(1, Math.floor(height / rowGap)) }, buildTickerRow)
    }

    const applyContentMask = () => {
      context.globalCompositeOperation = 'destination-in'
      const mask = context.createLinearGradient(0, 0, width, 0)
      mask.addColorStop(0, 'rgba(255,255,255,0.98)')
      mask.addColorStop(0.24, 'rgba(255,255,255,0.72)')
      mask.addColorStop(0.5, 'rgba(255,255,255,0.34)')
      mask.addColorStop(0.76, 'rgba(255,255,255,0.72)')
      mask.addColorStop(1, 'rgba(255,255,255,0.98)')
      context.fillStyle = mask
      context.fillRect(0, 0, width, height)
      context.globalCompositeOperation = 'source-over'
    }

    const drawMarket = (now: number) => {
      if (!paused && now - lastMutation > 420) {
        lastMutation = now
        const changes = Math.max(1, Math.round(cells.length * 0.035))
        for (let index = 0; index < changes; index += 1) {
          const cell = cells[Math.floor(Math.random() * cells.length)]
          if (cell) cell.glyph = financialGlyph(Math.random())
        }
      }

      context.font = '600 13px "Hanken Grotesk Variable", sans-serif'
      context.textAlign = 'center'
      context.textBaseline = 'middle'
      for (const cell of cells) {
        const tone = financialGlyphTone(cell.glyph)
        context.globalAlpha = cell.alpha * (tone === 'neutral' ? 0.62 : 1)
        context.fillStyle = tone === 'up' ? up : tone === 'down' ? down : mid
        context.fillText(cell.glyph, cell.x, cell.y)
      }
      context.globalAlpha = 1
      applyContentMask()
    }

    const drawTicker = (now: number) => {
      context.font = '600 13px "Hanken Grotesk Variable", sans-serif'
      context.textBaseline = 'middle'
      rows.forEach((row, index) => {
        const y = ((index + 0.5) * height) / rows.length
        const measured = context.measureText(row.text).width
        const span = measured + 180
        const direction = index % 2 === 0 ? 1 : -1
        const travelled = paused ? index * 120 : (now * row.speed) % span
        context.globalAlpha = row.alpha
        context.fillStyle = row.tone === 'up' ? up : down
        for (let repeat = -2; repeat < Math.ceil(width / span) + 2; repeat += 1) {
          const base = repeat * span + direction * travelled
          context.fillText(row.text, direction > 0 ? base - span : width - base, y)
        }
      })
      context.globalAlpha = 1
      applyContentMask()
    }

    const drawGrid = (now: number) => {
      const gap = width < 640 ? 32 : 40
      const minor = gap / 4
      context.strokeStyle = mark
      context.lineWidth = 1

      // malha fina entre as linhas principais
      context.globalAlpha = 0.022
      context.beginPath()
      for (let x = minor; x < width; x += minor) {
        context.moveTo(x + 0.5, 0)
        context.lineTo(x + 0.5, height)
      }
      for (let y = minor; y < height; y += minor) {
        context.moveTo(0, y + 0.5)
        context.lineTo(width, y + 0.5)
      }
      context.stroke()

      context.globalAlpha = 0.06
      context.beginPath()
      for (let x = gap; x < width; x += gap) {
        context.moveTo(x + 0.5, 0)
        context.lineTo(x + 0.5, height)
      }
      for (let y = gap; y < height; y += gap) {
        context.moveTo(0, y + 0.5)
        context.lineTo(width, y + 0.5)
      }
      context.stroke()

      // três séries de candles em alturas diferentes
      const phase = paused ? 0 : now * 0.00018
      const series = [
        { base: 0.22, swing: 0.08, shift: 0 },
        { base: 0.5, swing: 0.12, shift: 1.7 },
        { base: 0.78, swing: 0.08, shift: 3.1 },
      ]
      for (const { base, swing, shift } of series) {
        for (let x = gap / 2; x < width; x += gap / 2) {
          const edge = Math.abs(x / width - 0.5) * 2
          const center = height * (base + Math.sin(x * 0.013 + phase + shift) * swing)
          const candleHeight = 6 + (Math.sin(x * 0.021 + phase * 2 + shift) + 1) * 6
          const rising = Math.sin(x * 0.047 + shift * 2.3) > -0.15
          context.globalAlpha = 0.16 + edge * 0.26
          context.strokeStyle = rising ? up : down
          context.fillStyle = context.strokeStyle
          context.beginPath()
          context.moveTo(x + 0.5, center - candleHeight)
          context.lineTo(x + 0.5, center + candleHeight)
          context.stroke()
          context.fillRect(x - 1.5, center - candleHeight * 0.45, 4, candleHeight * 0.9)
        }
      }
      context.globalAlpha = 1
      applyContentMask()
    }

    const render = (now: number) => {
      context.clearRect(0, 0, width, height)
      if (variant === 'market') drawMarket(now)
      if (variant === 'ticker') drawTicker(now)
      if (variant === 'grid') drawGrid(now)
    }

    const cadence = variant === 'market' ? 420 : FRAME_MS
    const scheduler = createFrameScheduler(
      {
        hidden: () => paused || document.hidden,
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (id) => cancelAnimationFrame(id),
        setTimer: (callback, delay) => window.setTimeout(callback, delay),
        clearTimer: (id) => window.clearTimeout(id),
      },
      cadence,
      render,
    )
    const onVisibility = () => (document.hidden ? scheduler.stop() : scheduler.play())

    const observer = new ResizeObserver(() => {
      rebuild()
      render(performance.now())
    })
    observer.observe(canvas)
    document.addEventListener('visibilitychange', onVisibility)
    rebuild()
    render(0)
    scheduler.play()

    return () => {
      scheduler.stop()
      observer.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [paused, variant])

  return <canvas ref={canvasRef} className="market-canvas block h-full w-full" aria-hidden />
}
