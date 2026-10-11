import '@fontsource-variable/archivo/wght.css'
import { motion } from 'motion/react'
import { duration, ease } from '@/design/motion'

/**
 * O título da página, com o "a" de "financeiro" trocado pelo triângulo de
 * alta do pregão. Leitores de tela recebem a frase inteira; o desenho é só
 * para os olhos.
 */
export function Wordmark({ animated = false }: { animated?: boolean }) {
  return (
    <>
      <span className="sr-only">O seu painel financeiro</span>
      <span aria-hidden>
        O seu painel fin
        <motion.svg
          viewBox="0 0 100 92"
          // Na altura do "x" da fonte, com a base na linha do texto, como a letra que ele substitui.
          className="mx-[0.03em] inline-block h-[0.56em] w-[0.6em] fill-market-up stroke-market-up align-baseline"
          initial={animated ? { opacity: 0, y: '0.35em' } : false}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: duration.entrance, ease: ease.out, delay: 0.45 }}
        >
          <polygon points="50,6 96,88 4,88" strokeWidth={6} strokeLinejoin="round" />
        </motion.svg>
        nceiro
      </span>
    </>
  )
}
