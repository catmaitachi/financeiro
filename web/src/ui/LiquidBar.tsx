import LiquidGlass from 'liquid-glass-react'
import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

interface LiquidBarProps {
  /** Define o tamanho da barra (altura e largura); o vidro ocupa exatamente esse espaço. */
  className?: string
  children: ReactNode
}

/**
 * Barra flutuante de vidro líquido: o único lugar do produto com refração de
 * verdade. O conteúdo da página que rola por baixo dela é desfocado e curvado
 * na borda, como em uma lente.
 *
 * Usa `liquid-glass-react`, que desloca o fundo por um filtro SVG. É uma
 * aproximação web, não o material da Apple. Em Safari e Firefox o deslocamento
 * não aparece e sobra um vidro fosco comum, com o mesmo contraste.
 *
 * A biblioteca mede o próprio tamanho apenas ao montar. Por isso a barra mede
 * o espaço disponível, entrega as dimensões prontas e remonta o vidro quando
 * elas mudam. Enquanto não há medida, mostra a superfície comum.
 */
export function LiquidBar({ className, children }: LiquidBarProps) {
  const slotRef = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })

  useLayoutEffect(() => {
    const slot = slotRef.current
    if (!slot) return
    const measure = () => setSize({ width: slot.offsetWidth, height: slot.offsetHeight })
    const observer = new ResizeObserver(measure)
    observer.observe(slot)
    measure()
    return () => observer.disconnect()
  }, [])

  const content = <div className="liquid-bar-content flex size-full items-center">{children}</div>

  return (
    <div ref={slotRef} className={cn('liquid-bar relative', className)}>
      {size.width === 0 ? (
        <div className="surface size-full rounded-full">{content}</div>
      ) : (
        <LiquidGlass
          key={`${size.width}x${size.height}`}
          cornerRadius={999}
          padding="0"
          displacementScale={64}
          blurAmount={0.45}
          saturation={150}
          aberrationIntensity={1.5}
          // A barra não persegue o ponteiro: ela é chão firme para a navegação.
          elasticity={0}
          style={{ position: 'absolute', top: '50%', left: '50%' }}
        >
          <div className="bg-glass-clear" style={{ width: size.width, height: size.height }}>
            {content}
          </div>
        </LiquidGlass>
      )}
    </div>
  )
}
