import { IconContext } from '@phosphor-icons/react'
import { QueryClientProvider } from '@tanstack/react-query'
import { MotionConfig } from 'motion/react'
import type { ReactNode } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router'
import { SetupPage } from '@/features/setup/SetupPage'
import { queryClient } from '@/lib/query'
import { Background } from '@/ui/Background'
import { ToastProvider } from '@/ui/Toast'
import { Shell } from './Shell'

/** Um peso e um tamanho de ícone para o produto inteiro. */
const ICONS = { size: 18, weight: 'regular' } as const

/** O que toda tela precisa em volta: dados, movimento, ícones, avisos e o chão. */
export function AppFrame({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {/* `user`: quem pede menos movimento no sistema recebe só transições de opacidade. */}
      <MotionConfig reducedMotion="user">
        <IconContext.Provider value={ICONS}>
          <ToastProvider>
            <Background />
            {children}
          </ToastProvider>
        </IconContext.Provider>
      </MotionConfig>
    </QueryClientProvider>
  )
}

/** As telas do aplicativo. `basename` existe para a demonstração, que o serve fora da raiz. */
export function AppRoutes({ basename }: { basename?: string }) {
  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route path="*" element={<Shell />} />
      </Routes>
    </BrowserRouter>
  )
}

export function App() {
  return (
    <AppFrame>
      <AppRoutes />
    </AppFrame>
  )
}
