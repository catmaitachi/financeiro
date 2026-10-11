import {
  AirplaneTiltIcon,
  ArrowsLeftRightIcon,
  BankIcon,
  CarIcon,
  ChartLineUpIcon,
  DiceFiveIcon,
  DotsThreeCircleIcon,
  ForkKnifeIcon,
  GameControllerIcon,
  HandCoinsIcon,
  HeartbeatIcon,
  HeartIcon,
  HouseIcon,
  MonitorPlayIcon,
  PaperPlaneTiltIcon,
  PercentIcon,
  QuestionIcon,
  ReceiptIcon,
  ScalesIcon,
  ShieldCheckIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  WrenchIcon,
} from '@phosphor-icons/react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

/** Ícone de cada categoria de primeiro nível, pelo código da Pluggy. */
const ICONS: Record<string, ReactNode> = {
  '01000000': <HandCoinsIcon />,
  '02000000': <BankIcon />,
  '03000000': <ChartLineUpIcon />,
  '04000000': <ArrowsLeftRightIcon />,
  '05000000': <PaperPlaneTiltIcon />,
  '06000000': <ScalesIcon />,
  '07000000': <WrenchIcon />,
  '08000000': <ShoppingBagIcon />,
  '09000000': <MonitorPlayIcon />,
  '10000000': <ShoppingCartIcon />,
  '11000000': <ForkKnifeIcon />,
  '12000000': <AirplaneTiltIcon />,
  '13000000': <HeartIcon />,
  '14000000': <DiceFiveIcon />,
  '15000000': <ReceiptIcon />,
  '16000000': <PercentIcon />,
  '17000000': <HouseIcon />,
  '18000000': <HeartbeatIcon />,
  '19000000': <CarIcon />,
  '20000000': <ShieldCheckIcon />,
  '21000000': <GameControllerIcon />,
  '99999999': <DotsThreeCircleIcon />,
}

/** O ícone da categoria num círculo rebaixado. Decorativo: o nome da categoria sempre aparece escrito ao lado. */
export function CategoryIcon({ categoryId, className }: { categoryId: string | null; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn('surface-sunken flex size-9 shrink-0 items-center justify-center rounded-full text-accent-strong', className)}
    >
      {(categoryId && ICONS[categoryId]) || <QuestionIcon />}
    </span>
  )
}
