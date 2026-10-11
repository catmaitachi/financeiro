import { useReducedMotion } from 'motion/react'
import { MarketCanvas } from './MarketCanvas'
import { useBackgroundPreference } from './useBackgroundPreference'

/**
 * O chão do aplicativo: uma leitura abstrata de mercado, sempre atrás de um
 * véu que preserva o contraste dos dados e controles.
 */
export function Background() {
  const reduceMotion = useReducedMotion()
  const variant = useBackgroundPreference()

  return (
    <div className="pointer-events-none fixed inset-0 z-(--z-background) bg-market-ground" aria-hidden>
      <MarketCanvas variant={variant} paused={reduceMotion ?? false} />
      <div className="market-background-vignette absolute inset-0" />
    </div>
  )
}
