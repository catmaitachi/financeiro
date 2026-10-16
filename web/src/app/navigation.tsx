import {
  ArrowsClockwiseIcon,
  CalendarCheckIcon,
  CalendarDotsIcon,
  ChartPieSliceIcon,
  PlugsConnectedIcon,
  ReceiptIcon,
} from '@phosphor-icons/react'
import { lazy, type ComponentType, type LazyExoticComponent, type ReactNode } from 'react'

export interface Section {
  path: string
  label: string
  icon: ReactNode
  page: LazyExoticComponent<ComponentType>
}

/**
 * As áreas do produto. Acrescentar uma área é acrescentar uma linha aqui e uma
 * pasta em `features/`: navegação, rotas e carregamento sob demanda saem desta lista.
 */
export const sections: Section[] = [
  {
    path: '/',
    label: 'Painel',
    icon: <ChartPieSliceIcon />,
    page: lazy(() => import('@/features/dashboard/DashboardPage')),
  },
  {
    path: '/transacoes',
    label: 'Transações',
    icon: <ReceiptIcon />,
    page: lazy(() => import('@/features/transactions/TransactionsPage')),
  },
  {
    path: '/previsoes',
    label: 'Previsões',
    icon: <CalendarCheckIcon />,
    page: lazy(() => import('@/features/forecasts/ForecastsPage')),
  },
  {
    path: '/calendario',
    label: 'Calendário',
    icon: <CalendarDotsIcon />,
    page: lazy(() => import('@/features/calendar/CalendarPage')),
  },
  {
    path: '/assinaturas',
    label: 'Assinaturas',
    icon: <ArrowsClockwiseIcon />,
    page: lazy(() => import('@/features/subscriptions/SubscriptionsPage')),
  },
  {
    path: '/conexoes',
    label: 'Conexões',
    icon: <PlugsConnectedIcon />,
    page: lazy(() => import('@/features/connections/ConnectionsPage')),
  },
]

export function sectionFor(pathname: string): Section | undefined {
  return sections.find((section) => (section.path === '/' ? pathname === '/' : pathname.startsWith(section.path)))
}
