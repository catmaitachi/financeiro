import '@fontsource-variable/archivo/wght.css'
import { motion } from 'motion/react'
import { duration, ease } from '@/design/motion'
import { cn } from '@/lib/cn'

/**
 * O título da página, escrito com os sinais do pregão: o "u" de "seu" vira o
 * triângulo vermelho de baixa e o "a" de "financeiro", o verde de alta.
 * Leitores de tela recebem a frase inteira; o desenho é só para os olhos.
 */
export function Wordmark({ animated = false }: { animated?: boolean }) {
  return (
    <>
      <span className="sr-only">O seu painel financeiro</span>
      <span aria-hidden>
        O se
        <Sign direction="down" animated={animated} delay={0.45} />
        {' painel fin'}
        <Sign direction="up" animated={animated} delay={0.6} />
        nceiro
      </span>
    </>
  )
}

interface SignProps {
  direction: 'up' | 'down'
  animated: boolean
  delay: number
}

/** Um triângulo do tamanho de uma letra: na altura do "x" da fonte, com a base na linha do texto. */
function Sign({ direction, animated, delay }: SignProps) {
  const up = direction === 'up'
  return (
    <motion.svg
      viewBox="0 0 100 92"
      className={cn(
        'mx-[0.03em] inline-block h-[0.56em] w-[0.6em] align-baseline',
        up ? 'fill-market-up stroke-market-up' : 'fill-market-down stroke-market-down',
      )}
      // Cada sinal chega do lado para onde aponta: o de alta sobe, o de baixa desce.
      initial={animated ? { opacity: 0, y: up ? '0.35em' : '-0.35em' } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: duration.entrance, ease: ease.out, delay }}
    >
      <polygon points={up ? '50,6 96,88 4,88' : '4,6 96,6 50,88'} strokeWidth={6} strokeLinejoin="round" />
    </motion.svg>
  )
}
