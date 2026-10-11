import { CircleNotchIcon } from '@phosphor-icons/react'
import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Link, type LinkProps } from 'react-router'
import { cn } from '@/lib/cn'

type Variant = 'primary' | 'quiet' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

const VARIANT: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink shadow-control hover:bg-accent-strong',
  quiet: 'border border-edge bg-fill-hover text-text hover:border-edge-strong hover:bg-fill-active',
  ghost: 'text-text-2 hover:bg-fill-hover hover:text-text',
  danger: 'text-negative hover:bg-negative-wash',
}

const SIZE: Record<Size, string> = {
  sm: 'h-8 gap-1.5 px-3 text-sm',
  md: 'h-10 gap-2 px-4 text-base',
}

const BASE =
  'inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap select-none ' +
  'active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-40 disabled:active:scale-100'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
  icon?: ReactNode
  loading?: boolean
}

/** Botão do produto. Toda ação clicável com rótulo passa por aqui. */
export function Button({
  variant = 'quiet',
  size = 'md',
  icon,
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...rest
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(BASE, VARIANT[variant], SIZE[size], className)}
      {...rest}
    >
      {loading ? <CircleNotchIcon className="spin" size={size === 'md' ? 18 : 16} /> : icon}
      {children}
    </button>
  )
}

interface LinkButtonProps extends LinkProps {
  variant?: Variant
  size?: Size
  icon?: ReactNode
}

/** Navegação com aparência de botão: quando a ação é ir para outra tela. */
export function LinkButton({ variant = 'quiet', size = 'md', icon, className, children, ...rest }: LinkButtonProps) {
  return (
    <Link className={cn(BASE, VARIANT[variant], SIZE[size], className)} {...rest}>
      {icon}
      {children}
    </Link>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Obrigatório: o botão não tem texto visível. */
  label: string
  size?: Size
  variant?: 'quiet' | 'ghost'
}

export function IconButton({ label, size = 'md', variant = 'ghost', className, children, type = 'button', ...rest }: IconButtonProps) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full',
        'active:scale-[0.94] disabled:cursor-not-allowed disabled:opacity-40',
        VARIANT[variant],
        size === 'md' ? 'size-10' : 'size-8',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
