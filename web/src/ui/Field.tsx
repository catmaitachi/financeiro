import { CaretDownIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useId, useRef, useState, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react'
import { collapseVariants, popoverVariants } from '@/design/motion'
import { cn } from '@/lib/cn'

const CONTROL =
  'surface-sunken h-10 w-full rounded-full px-4 text-base text-text hover:border-edge-strong focus:border-accent ' +
  'focus:outline-none aria-invalid:border-negative disabled:cursor-not-allowed disabled:opacity-40'

interface FieldShellProps {
  label: string
  /** Texto de apoio, sempre visível abaixo do campo. */
  hint?: ReactNode
  /**
   * Ajuda mais longa (uma lista de exemplos) que só aparece enquanto o campo tem foco.
   * Flutua sobre o que vem depois: não empurra o formulário nem tira um botão de baixo do ponteiro.
   */
  focusHint?: ReactNode
  focusHintOpen?: boolean
  error?: string | null
  /** Esconde o rótulo visualmente (continua disponível para leitores de tela). */
  hideLabel?: boolean
  className?: string
}

function FieldShell({
  id,
  label,
  hint,
  focusHint,
  focusHintOpen,
  error,
  hideLabel,
  className,
  children,
}: FieldShellProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('relative flex min-w-0 flex-col gap-2', className)}>
      <label htmlFor={id} className={cn('text-sm font-medium text-text-2', hideLabel && 'sr-only')}>
        {label}
      </label>
      {children}
      {hint ? (
        <p id={`${id}-hint`} className="text-sm text-text-3">
          {hint}
        </p>
      ) : null}
      <AnimatePresence initial={false}>
        {error ? (
          <motion.p
            key="error"
            id={`${id}-error`}
            role="alert"
            variants={collapseVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="overflow-hidden text-sm text-negative"
          >
            {error}
          </motion.p>
        ) : null}
      </AnimatePresence>
      <AnimatePresence initial={false}>
        {focusHint && focusHintOpen ? (
          <motion.div
            key="focus-hint"
            id={`${id}-focus-hint`}
            variants={popoverVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="surface-raised pointer-events-none absolute inset-x-0 top-full z-(--z-nav) mt-2 origin-top rounded-md px-4 py-3 text-sm text-text-2"
          >
            {focusHint}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

type TextFieldProps = FieldShellProps &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & {
    /** Ícone ou botão dentro do campo, à direita. */
    trailing?: ReactNode
    leading?: ReactNode
    /** Cada caractere digitado chega subindo até a linha. Só para campos controlados e curtos. */
    typed?: boolean
  }

/** O texto do campo redesenhado por cima: o caractere que acabou de ser digitado sobe e firma. */
function TypedMirror({ value, fresh }: { value: string; fresh: number }) {
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 flex items-center overflow-hidden px-4 text-base whitespace-pre text-text">
      {[...value].map((char, index) => (
        <span key={index} className={index >= fresh ? 'typed-char' : undefined}>
          {char}
        </span>
      ))}
    </span>
  )
}

export function TextField({
  label,
  hint,
  focusHint,
  error,
  hideLabel,
  className,
  trailing,
  leading,
  typed,
  id,
  onFocus,
  onBlur,
  onKeyDown,
  ...input
}: TextFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  const [hintOpen, setHintOpen] = useState(false)
  const describedBy =
    [error ? `${fieldId}-error` : hint ? `${fieldId}-hint` : null, focusHint && hintOpen ? `${fieldId}-focus-hint` : null]
      .filter(Boolean)
      .join(' ') || undefined
  const text = typeof input.value === 'string' ? input.value : ''
  // A partir de qual posição o texto é novo: o que já estava na tela (ou foi colado ao montar) não anima.
  const previous = useRef(text)
  const fresh = text.length > previous.current.length && text.startsWith(previous.current) ? previous.current.length : text.length
  // Só depois de confirmada a renderização: no modo estrito ela roda duas vezes e a segunda leitura zeraria o que é novo.
  useEffect(() => {
    previous.current = text
  })
  return (
    <FieldShell
      id={fieldId}
      label={label}
      hint={hint}
      focusHint={focusHint}
      focusHintOpen={hintOpen}
      error={error}
      hideLabel={hideLabel}
      className={className}
    >
      <div className="relative">
        {leading ? (
          <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-text-3">{leading}</span>
        ) : null}
        <input
          id={fieldId}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          className={cn(CONTROL, leading ? 'pl-11' : undefined, trailing ? 'pr-11' : undefined, typed && 'text-transparent caret-accent')}
          {...input}
          onFocus={(event) => {
            setHintOpen(true)
            onFocus?.(event)
          }}
          onBlur={(event) => {
            setHintOpen(false)
            onBlur?.(event)
          }}
          onKeyDown={(event) => {
            // Esc dispensa a ajuda sem tirar o foco; voltar a digitar a traz de volta.
            if (focusHint) setHintOpen(event.key !== 'Escape')
            onKeyDown?.(event)
          }}
        />
        {typed ? <TypedMirror value={text} fresh={fresh} /> : null}
        {trailing ? <span className="absolute inset-y-0 right-1 flex items-center">{trailing}</span> : null}
      </div>
    </FieldShell>
  )
}

type SelectFieldProps = FieldShellProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>

export function SelectField({ label, hint, error, hideLabel, className, id, children, ...select }: SelectFieldProps) {
  const generated = useId()
  const fieldId = id ?? generated
  return (
    <FieldShell id={fieldId} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <div className="relative">
        <select id={fieldId} aria-invalid={error ? true : undefined} className={cn(CONTROL, 'cursor-pointer truncate pr-10')} {...select}>
          {children}
        </select>
        <CaretDownIcon size={16} className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-text-3" />
      </div>
    </FieldShell>
  )
}
