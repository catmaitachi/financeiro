import type { BankRef } from '@shared/banks'
import { cn } from '@/lib/cn'

interface Mark {
  /** Arquivo oficial, registrado pelo próprio banco no diretório do Open Finance Brasil. */
  src: string
  /** O arquivo é só o desenho, sem fundo: ganha um azulejo branco para ler sobre o vidro escuro. */
  tile?: boolean
  /** O arquivo traz margem em volta do selo: é ampliado para o selo preencher o espaço. */
  crop?: boolean
}

/**
 * Selos dos bancos conhecidos. Os arquivos vêm de `web/public/banks/` e são os
 * logotipos oficiais; sem arquivo, o banco aparece como a inicial do nome.
 */
const MARKS: Record<string, Mark> = {
  nubank: { src: '/banks/nubank.svg', tile: true },
  inter: { src: '/banks/inter.svg' },
  picpay: { src: '/banks/picpay.svg', crop: true },
}

const SIZE = { sm: 'size-6 rounded-[7px]', md: 'size-9 rounded-[10px]', lg: 'size-11 rounded-[12px]' } as const

interface BankLogoProps {
  bank: BankRef
  size?: keyof typeof SIZE
  className?: string
}

/** O selo do banco. É decorativo: o nome do banco sempre aparece escrito ao lado. */
export function BankLogo({ bank, size = 'md', className }: BankLogoProps) {
  const mark = MARKS[bank.id]
  return (
    <span
      aria-hidden="true"
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden',
        SIZE[size],
        mark?.tile ? 'bg-logo-tile' : mark ? '' : 'bg-coffee font-display font-bold text-cream',
        className,
      )}
    >
      {mark ? (
        <img
          src={mark.src}
          alt=""
          draggable={false}
          className={cn('block shrink-0', mark.tile ? 'size-[72%]' : mark.crop ? 'size-[154%] max-w-none' : 'size-full')}
        />
      ) : (
        bank.name.charAt(0).toUpperCase()
      )}
    </span>
  )
}
