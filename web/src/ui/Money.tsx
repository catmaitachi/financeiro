import { animate, motion, useMotionValue, useReducedMotion, useTransform } from 'motion/react'
import { useEffect } from 'react'
import { ease } from '@/design/motion'
import { formatMoney } from '@/lib/format'
import { MASK, useValuesHidden } from '@/lib/privacy'

interface MoneyProps {
  cents: number
  currencyCode?: string
  className?: string
}

/** Duração da contagem, em segundos. */
const COUNT_DURATION = 1.4

/**
 * Valor monetário que corre de zero até o número final ao aparecer.
 * Também recontagem quando o valor muda (troca de mês, nova sincronização).
 */
export function Money({ cents, currencyCode = 'BRL', className }: MoneyProps) {
  const reduceMotion = useReducedMotion()
  const hidden = useValuesHidden()
  const value = useMotionValue(reduceMotion ? cents : 0)
  const text = useTransform(value, (current) => formatMoney(Math.round(current), currencyCode))

  useEffect(() => {
    if (reduceMotion) {
      value.set(cents)
      return
    }
    const controls = animate(value, cents, { duration: COUNT_DURATION, ease: ease.out })
    return () => controls.stop()
  }, [cents, reduceMotion, value])

  if (hidden) return <span className={className}>{MASK}</span>

  return (
    <span className={className}>
      <span className="sr-only">{formatMoney(cents, currencyCode)}</span>
      <motion.span aria-hidden>{text}</motion.span>
    </span>
  )
}
