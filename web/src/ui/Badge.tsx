import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Tone = 'neutral' | 'accent' | 'positive' | 'negative' | 'warning'

const TONE: Record<Tone, string> = {
  neutral: 'bg-fill-hover text-text-2',
  accent: 'bg-accent-wash text-accent-strong',
  positive: 'bg-positive-wash text-positive',
  negative: 'bg-negative-wash text-negative',
  warning: 'bg-warning-wash text-warning',
}

/** Etiqueta de estado. Sempre com texto; a cor só reforça. */
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: Tone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
        TONE[tone],
        className,
      )}
    >
      {icon}
      {children}
    </span>
  )
}
