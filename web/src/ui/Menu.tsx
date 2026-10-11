import { DotsThreeIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { popoverVariants } from '@/design/motion'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

export interface MenuItem {
  label: string
  icon?: ReactNode
  onSelect: () => void
  tone?: 'default' | 'danger'
  disabled?: boolean
}

/** Menu de ações de uma linha ("mais opções"). */
export function Menu({ label, items }: { label: string; items: MenuItem[] }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
        ref.current?.querySelector('button')?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  if (!items.length) return null

  return (
    <div ref={ref} className="relative">
      <IconButton label={label} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <DotsThreeIcon size={20} weight="bold" />
      </IconButton>
      <AnimatePresence>
        {open ? (
          <motion.div
            role="menu"
            variants={popoverVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="surface-raised absolute top-full right-0 z-(--z-nav) mt-2 min-w-56 origin-top-right rounded-md p-1"
          >
            {items.map((item) => (
              <button
                key={item.label}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  setOpen(false)
                  item.onSelect()
                }}
                className={cn(
                  'flex h-9 w-full items-center gap-2 rounded-sm px-3 text-left text-base whitespace-nowrap',
                  'disabled:cursor-not-allowed disabled:opacity-40',
                  item.tone === 'danger' ? 'text-negative hover:bg-negative-wash' : 'text-text hover:bg-fill-active',
                )}
              >
                {item.icon}
                {item.label}
              </button>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  )
}
