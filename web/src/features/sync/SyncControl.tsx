import { ArrowsClockwiseIcon } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { formatRelative } from '@/lib/format'
import { Button } from '@/ui/Button'
import { useSync } from './useSync'

/** Reavalia o "há X minutos" enquanto a tela fica aberta. */
function useNow(intervalMs: number) {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(timer)
  }, [intervalMs])
  return now
}

/** Estado da sincronização e o botão "Atualizar agora", sempre à mão na barra superior. */
export function SyncControl() {
  const { running, lastSuccessAt, lastRun, syncNow } = useSync()
  const now = useNow(30_000)

  const status = running
    ? 'Sincronizando'
    : lastRun?.status === 'failed'
      ? 'Última tentativa falhou'
      : lastSuccessAt
        ? `Atualizado ${formatRelative(lastSuccessAt, now)}`
        : 'Ainda não sincronizado'

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="primary"
        title={status}
        aria-label={`Atualizar agora. ${status}`}
        className="px-3 lg:px-4"
        onClick={syncNow}
        disabled={running}
        icon={<ArrowsClockwiseIcon weight="bold" className={running ? 'spin' : undefined} />}
      >
        {/* Em telas médias a navegação precisa do espaço: fica só o ícone. */}
        <span className="sr-only lg:not-sr-only">Atualizar agora</span>
      </Button>
    </div>
  )
}
