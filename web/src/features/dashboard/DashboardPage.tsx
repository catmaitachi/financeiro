import { PlugsConnectedIcon, WarningCircleIcon } from '@phosphor-icons/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { useSearchParams } from 'react-router'
import { isMonth, type Month } from '@shared/months'
import { staggerVariants } from '@/design/motion'
import { bankTones } from '@/features/banks/tones'
import { useSyncOnOpen } from '@/features/sync/useSync'
import { api } from '@/lib/api'
import { cn } from '@/lib/cn'
import { keys } from '@/lib/query'
import { Button, LinkButton } from '@/ui/Button'
import { EmptyState, Notice, Skeleton } from '@/ui/Feedback'
import { Panel } from '@/ui/Panel'
import { AttentionList } from './AttentionList'
import { BalancesPanel } from './BalancesPanel'
import { BankBills } from './BankBills'
import { BillCategories } from './BillCategories'
import { BillYear } from './BillYear'
import { RecentPanel } from './RecentPanel'
import { UpcomingEvents } from './UpcomingEvents'

function Loading() {
  return (
    <div className="flex flex-col gap-6" aria-busy="true" aria-label="Carregando o painel">
      <Skeleton className="h-72 w-full rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-12">
        <Skeleton className="h-80 rounded-lg lg:col-span-7" />
        <Skeleton className="h-80 rounded-lg lg:col-span-5" />
      </div>
    </div>
  )
}

export default function DashboardPage() {
  useSyncOnOpen()

  const [params, setParams] = useSearchParams()
  const requested = params.get('mes')
  const month: Month | undefined = isMonth(requested) ? requested : undefined

  const query = useQuery({
    queryKey: keys.dashboard(month),
    queryFn: () => api.dashboard(month),
    // Ao trocar de mês, o quadro anterior fica na tela até o novo chegar.
    placeholderData: keepPreviousData,
  })
  const dashboard = query.data

  const select = (next: Month) => setParams(next === dashboard?.focusMonth ? {} : { mes: next }, { replace: true })

  if (query.isPending) return <Loading />

  if (!dashboard) {
    return (
      <Notice
        tone="negative"
        icon={<WarningCircleIcon size={20} />}
        title="Não foi possível montar o painel"
        action={
          <Button size="sm" onClick={() => void query.refetch()}>
            Tentar de novo
          </Button>
        }
      >
        {query.error?.message}
      </Notice>
    )
  }

  if (!dashboard.hasData) {
    return (
      <motion.div variants={staggerVariants} initial="initial" animate="enter">
        <Panel>
          <EmptyState
            icon={<PlugsConnectedIcon size={22} />}
            title="Ainda não há lançamentos por aqui"
            action={
              <LinkButton variant="primary" to="/conexoes?conectar=1">
                Conectar instituição
              </LinkButton>
            }
          >
            Conecte um banco ou cartão para ver as faturas reunidas, o saldo e as últimas transações.
          </EmptyState>
        </Panel>
      </motion.div>
    )
  }

  const tones = bankTones(dashboard.banks.map((entry) => entry.bank.id))
  return (
    <motion.div
      variants={staggerVariants}
      initial="initial"
      animate="enter"
      // Enquanto o novo mês carrega, o conteúdo anterior esmaece em vez de piscar.
      className={cn('flex flex-col gap-6 transition-opacity duration-(--dur-state)', query.isPlaceholderData && 'opacity-60')}
    >
      {/* O que se vem conferir: a fatura do mês em foco (o seguinte, quando as do atual já estão pagas), de qual banco vem cada parte, o que falta pagar e o que a previsão diz sobre isso. */}
      <BankBills
        month={dashboard.focusMonth}
        currentMonth={dashboard.currentMonth}
        banks={dashboard.banks}
        tones={tones}
        forecasts={dashboard.forecasts}
        forecastMonth={dashboard.month}
      />

      {/* Duas colunas. À esquerda, o que acabou de acontecer e o ano das faturas, que também escolhe o mês das categorias.
          À direita, quanto há em conta, a fatura por categoria (começa onde o saldo termina) e o que pede atenção. */}
      <div className="grid items-stretch gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <RecentPanel />
          <div className="flex flex-1 flex-col *:flex-1">
            <BillYear
              year={dashboard.billYear}
              banks={dashboard.banks}
              selected={dashboard.month}
              currentMonth={dashboard.currentMonth}
              tones={tones}
              onSelect={select}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
          <BalancesPanel banks={dashboard.banks} />
          <UpcomingEvents />
          <BillCategories month={dashboard.month} categories={dashboard.billCategories} tones={tones} />
          <AttentionList dashboard={dashboard} />
        </div>
      </div>
    </motion.div>
  )
}
