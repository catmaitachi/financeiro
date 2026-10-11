import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface ChipProps {
  pressed: boolean
  onClick: () => void
  icon?: ReactNode
  children: ReactNode
  className?: string
}

/** Filtro de ligar e desligar. Vários podem conviver em uma faixa; a escolha única é do `Segmented`. */
export function Chip({ pressed, onClick, icon, children, className }: ChipProps) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-2 rounded-full border px-3 text-sm font-medium whitespace-nowrap active:scale-[0.97]',
        pressed
          ? 'border-accent bg-accent-wash text-text'
          : 'border-edge text-text-2 hover:border-edge-strong hover:bg-fill-hover hover:text-text',
        className,
      )}
    >
      {icon}
      {children}
    </button>
  )
}
