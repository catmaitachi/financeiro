import { motion, type HTMLMotionProps } from 'motion/react'
import { itemVariants } from '@/design/motion'
import { cn } from '@/lib/cn'

interface PanelProps extends HTMLMotionProps<'section'> {
  /** `raised` para o que flutua sobre a página; `sunken` para áreas rebaixadas. */
  tone?: 'surface' | 'raised' | 'sunken'
  padded?: boolean
}

const TONE = { surface: 'surface', raised: 'surface-raised', sunken: 'surface-sunken' } as const

/**
 * Superfície de vidro. Dentro de um grupo com `staggerVariants`, entra em
 * sequência com os irmãos; sozinha, não anima.
 */
export function Panel({ tone = 'surface', padded = true, className, children, ...rest }: PanelProps) {
  return (
    <motion.section
      variants={itemVariants}
      className={cn(TONE[tone], 'min-w-0 rounded-lg', padded && 'p-6', className)}
      {...rest}
    >
      {children}
    </motion.section>
  )
}

/** Título de painel, com espaço opcional para uma ação à direita. */
export function PanelHeader({ title, description, action }: { title: string; description?: string; action?: React.ReactNode }) {
  return (
    <header className="mb-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <h2 className="text-lg text-text">{title}</h2>
        {description ? <p className="mt-1 text-sm text-text-3">{description}</p> : null}
      </div>
      {action}
    </header>
  )
}
