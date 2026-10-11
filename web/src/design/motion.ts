/**
 * Vocabulário de movimento. Espelha os tokens `--dur-*` e `--ease-*` de
 * tokens.css para os componentes animados pela biblioteca Motion.
 *
 * Regra do produto: nenhuma mudança de estado acontece sem transição, e toda
 * transição explica algo (retorno de uma ação, troca de estado, continuidade).
 */
import type { Transition, Variants } from 'motion/react'

export const duration = {
  feedback: 0.12,
  state: 0.22,
  layout: 0.38,
  entrance: 0.64,
} as const

export const ease = {
  out: [0.16, 1, 0.3, 1],
  inOut: [0.65, 0, 0.35, 1],
} as const

export const spring = {
  /** A pílula de seleção: chega decidida, sem quicar. */
  lens: { type: 'spring', stiffness: 420, damping: 38, mass: 0.9 },
  /** Reordenação e mudança de tamanho de blocos. */
  layout: { type: 'spring', stiffness: 360, damping: 36 },
} satisfies Record<string, Transition>

const stateTransition: Transition = { duration: duration.state, ease: ease.out }
const layoutTransition: Transition = { duration: duration.layout, ease: ease.out }

/**
 * Troca de página: a que sai some rápido, a que entra sobe um pouco.
 * Só opacidade e deslocamento: um `filter` neste nível isolaria os painéis do
 * fundo e apagaria o vidro durante a animação.
 */
export const pageVariants: Variants = {
  initial: { opacity: 0, y: 10 },
  enter: { opacity: 1, y: 0, transition: layoutTransition, transitionEnd: { transform: 'none' } },
  exit: { opacity: 0, y: -6, transition: { duration: duration.feedback, ease: ease.inOut } },
}

/** Grupo que revela os filhos em sequência curta (listas que chegam como lista). */
export const staggerVariants: Variants = {
  initial: {},
  enter: { transition: { staggerChildren: 0.035, delayChildren: 0.02 } },
  exit: {},
}

export const itemVariants: Variants = {
  initial: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: layoutTransition },
  exit: { opacity: 0, transition: { duration: duration.feedback } },
}

/** Conteúdo que troca no mesmo lugar (texto de status, ícone, valor). */
export const swapVariants: Variants = {
  initial: { opacity: 0, y: 4 },
  enter: { opacity: 1, y: 0, transition: stateTransition },
  exit: { opacity: 0, y: -4, transition: { duration: duration.feedback } },
}

/** Bloco que abre e fecha empurrando o que vem depois (erros de formulário, editores). */
export const collapseVariants: Variants = {
  initial: { opacity: 0, height: 0 },
  enter: { opacity: 1, height: 'auto', transition: layoutTransition },
  exit: { opacity: 0, height: 0, transition: stateTransition },
}

export const veilVariants: Variants = {
  initial: { opacity: 0 },
  enter: { opacity: 1, transition: stateTransition },
  exit: { opacity: 0, transition: stateTransition },
}

export const dialogVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: 12 },
  enter: { opacity: 1, scale: 1, y: 0, transition: layoutTransition },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: stateTransition },
}

export const drawerVariants: Variants = {
  initial: { opacity: 0, x: 40 },
  enter: { opacity: 1, x: 0, transition: layoutTransition },
  exit: { opacity: 0, x: 24, transition: stateTransition },
}

export const popoverVariants: Variants = {
  initial: { opacity: 0, scale: 0.96, y: -4 },
  enter: { opacity: 1, scale: 1, y: 0, transition: stateTransition },
  exit: { opacity: 0, scale: 0.98, transition: { duration: duration.feedback } },
}

export const toastVariants: Variants = {
  initial: { opacity: 0, y: 16, scale: 0.96 },
  enter: { opacity: 1, y: 0, scale: 1, transition: layoutTransition },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: stateTransition },
}
