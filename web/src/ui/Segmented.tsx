import { motion } from 'motion/react'
import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { spring } from '@/design/motion'
import { cn } from '@/lib/cn'

export interface SegmentedOption<T extends string> {
  value: T
  label: string
  /** Versão abreviada, usada no lugar do rótulo em telas estreitas. */
  shortLabel?: string
  icon?: ReactNode
}

interface SegmentedProps<T extends string> {
  /** Nome do grupo para leitores de tela. */
  label: string
  options: SegmentedOption<T>[]
  value: T
  onChange: (value: T) => void
  size?: 'sm' | 'md'
  /**
   * Esconde os rótulos abaixo da largura dada, deixando só os ícones; na faixa
   * seguinte mostra só o rótulo e, acima dela, os dois.
   */
  compactBelow?: 'md' | 'lg'
  className?: string
}

/** As classes saem escritas por inteiro para o Tailwind encontrá-las. */
const COMPACT = {
  md: { icon: 'md:hidden lg:inline-flex', label: 'hidden md:inline' },
  lg: { icon: 'lg:hidden xl:inline-flex', label: 'hidden lg:inline' },
} as const

/**
 * Escolha única entre poucas opções. É o padrão de seleção do produto: uma
 * pílula de vidro desliza até a opção ativa, por baixo do rótulo, que continua
 * sempre nítido.
 */
export function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
  size = 'md',
  compactBelow,
  className,
}: SegmentedProps<T>) {
  const trackRef = useRef<HTMLDivElement>(null)
  const index = options.findIndex((option) => option.value === value)

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const step = event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = options[(Math.max(index, 0) + step + options.length) % options.length]!
    onChange(next.value)
    trackRef.current?.querySelector<HTMLButtonElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      onKeyDown={onKeyDown}
      className={cn('surface-sunken relative grid rounded-full p-1', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {/* A pílula vem antes dos botões: fica por baixo dos rótulos. */}
      <motion.span
        aria-hidden
        className="lens pointer-events-none absolute top-1 bottom-1 left-1"
        style={{ width: `calc((100% - 0.5rem) / ${options.length})` }}
        initial={false}
        animate={{ x: `${Math.max(index, 0) * 100}%`, opacity: index < 0 ? 0 : 1 }}
        transition={spring.lens}
      />

      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={option.label}
            data-value={option.value}
            tabIndex={selected || (index < 0 && option === options[0]) ? 0 : -1}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative flex min-w-0 items-center justify-center gap-2 rounded-full font-medium whitespace-nowrap',
              size === 'md' ? 'h-9 px-3 text-base' : 'h-7 px-2 text-sm',
              selected ? 'text-text' : 'text-text-2 hover:text-text',
            )}
          >
            {option.icon ? (
              // Só ícone nas telas estreitas, só rótulo na faixa seguinte, os dois nas largas.
              <span className={cn('shrink-0', compactBelow && COMPACT[compactBelow].icon)}>{option.icon}</span>
            ) : null}
            {option.shortLabel ? <span className="sm:hidden">{option.shortLabel}</span> : null}
            <span
              className={cn(
                'truncate',
                option.shortLabel ? 'hidden sm:inline' : undefined,
                compactBelow && option.icon ? COMPACT[compactBelow].label : undefined,
              )}
            >
              {option.label}
            </span>
          </button>
        )
      })}
    </div>
  )
}
