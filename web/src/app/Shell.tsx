import { CloudSlashIcon, EyeIcon, EyeSlashIcon } from '@phosphor-icons/react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { Suspense, useEffect } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { pageVariants } from '@/design/motion'
import { SyncControl } from '@/features/sync/SyncControl'
import { api, CREDENTIALS_REQUIRED_EVENT } from '@/lib/api'
import { setValuesHidden, useValuesHidden } from '@/lib/privacy'
import { keys, queryClient } from '@/lib/query'
import { Button } from '@/ui/Button'
import { Notice, Skeleton } from '@/ui/Feedback'
import { LiquidBar } from '@/ui/LiquidBar'
import { Segmented } from '@/ui/Segmented'
import { sectionFor, sections } from './navigation'

/** Estados de credencial que impedem o uso e mandam a pessoa para /setup. */
const NEEDS_SETUP = new Set(['missing', 'incomplete', 'invalid'])

function PageFallback() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando">
      <Skeleton className="h-10 w-72" />
      <Skeleton className="h-40 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="h-64 rounded-lg" />
        <Skeleton className="h-64 rounded-lg" />
      </div>
    </div>
  )
}

export function Shell() {
  const location = useLocation()
  const navigate = useNavigate()
  const setup = useQuery({ queryKey: keys.setup, queryFn: api.setup.status })
  const current = sectionFor(location.pathname)
  const hidden = useValuesHidden()

  // Se a Pluggy recusar as credenciais no meio do uso, a checagem é refeita na hora.
  useEffect(() => {
    const recheck = () => void queryClient.invalidateQueries({ queryKey: keys.setup })
    window.addEventListener(CREDENTIALS_REQUIRED_EVENT, recheck)
    return () => window.removeEventListener(CREDENTIALS_REQUIRED_EVENT, recheck)
  }, [])

  if (setup.data && NEEDS_SETUP.has(setup.data.state)) return <Navigate to="/setup" replace />

  const nav = (
    <Segmented
      label="Áreas do aplicativo"
      options={sections.map((section) => ({ value: section.path, label: section.label, icon: section.icon }))}
      value={current?.path ?? ''}
      onChange={(path) => navigate(path)}
      compactOnMobile
    />
  )

  return (
    <div className="relative z-(--z-content) flex min-h-dvh flex-col">
      {/* As barras flutuantes são de vidro líquido: o conteúdo rola por baixo e refrata na borda. */}
      <header className="sticky top-0 z-(--z-nav) px-4 pt-4 md:px-6">
        <LiquidBar className="mx-auto h-16 max-w-[1180px]">
          <div className="flex w-full items-center justify-between gap-4 px-3">
            <nav className="hidden w-[520px] max-w-full md:block lg:w-[620px]">{nav}</nav>
            <div className="ml-auto flex items-center gap-2">
              <Button
                variant="ghost"
                className="px-3"
                title={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                aria-label={hidden ? 'Mostrar valores' : 'Ocultar valores'}
                aria-pressed={hidden}
                onClick={() => setValuesHidden(!hidden)}
                icon={hidden ? <EyeSlashIcon size={20} /> : <EyeIcon size={20} />}
              />
              <SyncControl />
            </div>
          </div>
        </LiquidBar>
      </header>

      <main className="mx-auto w-full max-w-[1180px] flex-1 px-4 pt-8 pb-28 md:px-6 md:pb-16">
        {setup.data?.state === 'unreachable' ? (
          <Notice tone="warning" icon={<CloudSlashIcon size={20} />} title="Sem conexão com a Pluggy" className="mb-6">
            Você está vendo os dados já guardados nesta máquina. A sincronização volta assim que a conexão for restabelecida.
          </Notice>
        ) : null}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={current?.path ?? location.pathname} variants={pageVariants} initial="initial" animate="enter" exit="exit">
            <Suspense fallback={<PageFallback />}>
              <Routes location={location}>
                {sections.map(({ path, page: Page }) => (
                  <Route key={path} path={path === '/' ? '/' : `${path}/*`} element={<Page />} />
                ))}
                <Route path="/ajustes/*" element={<Navigate to="/conexoes" replace />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Suspense>
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Em telas estreitas a navegação vira uma barra inferior, ao alcance do polegar. */}
      <nav className="fixed inset-x-4 bottom-4 z-(--z-nav) md:hidden">
        <LiquidBar className="h-12">
          <div className="w-full px-1">{nav}</div>
        </LiquidBar>
      </nav>
    </div>
  )
}
