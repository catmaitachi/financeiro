import { CheckCircleIcon, InfoIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { AnimatePresence, motion } from 'motion/react'
import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react'
import { toastVariants } from '@/design/motion'

type ToastTone = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  tone: ToastTone
  message: string
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null)

const ICON = {
  success: <CheckCircleIcon size={18} weight="fill" className="text-positive" />,
  error: <WarningCircleIcon size={18} weight="fill" className="text-negative" />,
  info: <InfoIcon size={18} weight="fill" className="text-accent" />,
}

const LIFETIME_MS = 4500

/** Retorno passageiro de uma ação (salvou, sincronizou, falhou). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const nextId = useRef(1)

  const notify = useCallback((message: string, tone: ToastTone = 'success') => {
    const id = nextId.current++
    setItems((current) => [...current.slice(-2), { id, tone, message }])
    setTimeout(() => setItems((current) => current.filter((item) => item.id !== id)), LIFETIME_MS)
  }, [])

  const value = useMemo(() => notify, [notify])

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-20 z-(--z-toast) flex flex-col items-center gap-2 px-4 md:bottom-6"
      >
        <AnimatePresence>
          {items.map((item) => (
            <motion.div
              key={item.id}
              layout
              variants={toastVariants}
              initial="initial"
              animate="enter"
              exit="exit"
              className="surface-raised pointer-events-auto flex max-w-md items-center gap-2 rounded-full py-2 pr-4 pl-3 text-base text-text"
            >
              {ICON[item.tone]}
              {item.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const notify = useContext(ToastContext)
  if (!notify) throw new Error('useToast precisa estar dentro de <ToastProvider>.')
  return notify
}
