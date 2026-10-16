import { useState } from 'react'
import { cn } from '@/lib/cn'

/**
 * De onde vem o logotipo de um serviço. É o único lugar que conhece o
 * provedor: trocar de provedor é mudar esta função. O navegador busca a
 * imagem direto, então o domínio do serviço é enviado ao provedor.
 */
export function logoUrl(domain: string): string {
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
}

/** Sem logotipo para o domínio, o provedor devolve um globo genérico de 16px: vale como ausência. */
const PLACEHOLDER_SIZE = 16

const SIZE = { xs: 'size-4 rounded-[4px] text-[9px]', sm: 'size-6 rounded-[7px] text-xs', md: 'size-9 rounded-[10px] text-base', lg: 'size-11 rounded-[12px] text-md' } as const

interface ServiceLogoProps {
  name: string
  domain: string | null
  size?: keyof typeof SIZE
  className?: string
}

/** O selo do serviço. É decorativo: o nome sempre aparece escrito ao lado. Sem logotipo, mostra a inicial. */
export function ServiceLogo({ name, domain, size = 'md', className }: ServiceLogoProps) {
  // Guarda o domínio que falhou, e não um booleano: ao trocar de site, a imagem é tentada de novo.
  const [failed, setFailed] = useState<string | null>(null)
  const [loaded, setLoaded] = useState<string | null>(null)
  const usable = domain !== null && failed !== domain

  return (
    <span
      aria-hidden="true"
      className={cn(
        'relative flex shrink-0 items-center justify-center overflow-hidden font-display font-bold transition-colors duration-200',
        SIZE[size],
        usable && loaded === domain ? 'bg-logo-tile' : 'bg-coffee text-cream',
        className,
      )}
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
      {usable ? (
        <img
          key={domain}
          src={logoUrl(domain)}
          alt=""
          loading="lazy"
          draggable={false}
          referrerPolicy="no-referrer"
          onLoad={(event) => (event.currentTarget.naturalWidth > PLACEHOLDER_SIZE ? setLoaded(domain) : setFailed(domain))}
          onError={() => setFailed(domain)}
          className={cn(
            'absolute inset-0 m-auto block size-[78%] rounded-[5px] object-contain transition-opacity duration-200',
            loaded === domain ? 'opacity-100' : 'opacity-0',
          )}
        />
      ) : null}
    </span>
  )
}
