import { motion } from 'motion/react'
import type { ReactNode } from 'react'
import { itemVariants } from '@/design/motion'
import { cn } from '@/lib/cn'
import type { Tone } from './Badge'

/** Bloco de carregamento com o formato do conteúdo que vai chegar. */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('skeleton', className)} aria-hidden />
}

interface EmptyStateProps {
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}

/** Ausência de dados: diz o que falta e como resolver. */
export function EmptyState({ icon, title, children, action, className }: EmptyStateProps) {
  return (
    <motion.div
      variants={itemVariants}
      className={cn('flex flex-col items-center px-6 py-12 text-center', className)}
    >
      <span className="surface-sunken mb-4 flex size-12 items-center justify-center rounded-full text-accent">{icon}</span>
      <h2 className="text-lg text-text">{title}</h2>
      {children ? <p className="mt-2 max-w-[46ch] text-base text-text-2">{children}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </motion.div>
  )
}

const NOTICE_TONE: Record<Tone, string> = {
  neutral: 'text-text-2',
  accent: 'text-accent-strong',
  positive: 'text-positive',
  negative: 'text-negative',
  warning: 'text-warning',
}

interface NoticeProps {
  tone?: Tone
  icon: ReactNode
  title: string
  children?: ReactNode
  action?: ReactNode
  className?: string
}

/** Aviso em linha: um estado que merece atenção, com a saída ao lado. */
export function Notice({ tone = 'neutral', icon, title, children, action, className }: NoticeProps) {
  return (
    <div role="status" className={cn('surface flex items-start gap-3 rounded-lg p-4', className)}>
      <span className={cn('mt-0.5 shrink-0', NOTICE_TONE[tone])}>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="font-medium text-text">{title}</p>
        {children ? <p className="mt-1 text-sm text-text-2">{children}</p> : null}
      </div>
      {action}
    </div>
  )
}
