import { XIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion, type Variants } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { dialogVariants, drawerVariants, veilVariants } from '@/design/motion'
import { cn } from '@/lib/cn'
import { IconButton } from './Button'

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

/** Comportamento comum de camadas modais: foco preso, Esc fecha, foco devolvido ao sair. */
function useModal(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  // Guardado em ref para que um `onClose` recriado a cada render não refaça o foco.
  const close = useRef(onClose)
  close.current = onClose

  useEffect(() => {
    if (!open) return
    const previous = document.activeElement as HTMLElement | null
    const node = ref.current
    const first = node?.querySelector<HTMLElement>('[data-autofocus]') ?? node?.querySelector<HTMLElement>(FOCUSABLE)
    ;(first ?? node)?.focus()

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        close.current()
        return
      }
      if (event.key !== 'Tab' || !node) return
      const items = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)]
      if (!items.length) return
      const firstItem = items[0]!
      const lastItem = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault()
        lastItem.focus()
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault()
        firstItem.focus()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = overflow
      previous?.focus()
    }
  }, [open])

  return ref
}

interface LayerProps {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  children?: ReactNode
  footer?: ReactNode
}

function Layer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  variants,
  placement,
  surface,
}: LayerProps & { variants: Variants; placement: string; surface: string }) {
  const ref = useModal(open, onClose)
  const titleId = useId()

  return createPortal(
    <AnimatePresence>
      {open ? (
        <div className={cn('fixed inset-0 z-(--z-overlay) flex', placement)}>
          <motion.div
            variants={veilVariants}
            initial="initial"
            animate="enter"
            exit="exit"
            className="absolute inset-0 bg-veil"
            onClick={onClose}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={variants}
            initial="initial"
            animate="enter"
            exit="exit"
            className={cn('surface-raised relative flex max-h-full flex-col outline-none', surface)}
          >
            <header className="flex items-start justify-between gap-4 p-6 pb-4">
              <div className="min-w-0">
                <h2 id={titleId} className="text-lg text-text">
                  {title}
                </h2>
                {description ? <p className="mt-2 text-base text-text-2">{description}</p> : null}
              </div>
              <IconButton label="Fechar" size="sm" onClick={onClose} className="-mt-1 -mr-2">
                <XIcon size={16} />
              </IconButton>
            </header>
            {children ? <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">{children}</div> : null}
            {footer ? <footer className="flex flex-wrap justify-end gap-2 p-6 pt-2">{footer}</footer> : null}
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>,
    document.body,
  )
}

/** Confirmação ou tarefa curta que precisa interromper. */
export function Dialog(props: LayerProps) {
  return (
    <Layer
      {...props}
      variants={dialogVariants}
      placement="items-center justify-center p-4"
      surface="w-full max-w-md rounded-lg"
    />
  )
}

/** Painel lateral: detalhes de um item sem perder a lista de vista. */
export function Drawer(props: LayerProps) {
  return (
    <Layer
      {...props}
      variants={drawerVariants}
      placement="items-stretch justify-end p-3"
      surface="w-full max-w-md rounded-lg"
    />
  )
}
