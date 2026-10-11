export const backgroundOptions = [
  { value: 'market', label: 'Mercado', description: 'Números e sinais financeiros espalhados, com mais presença nas bordas.' },
  { value: 'ticker', label: 'Fita', description: 'Cotações abstratas atravessam a tela lentamente em faixas horizontais.' },
  { value: 'grid', label: 'Grade', description: 'Uma malha técnica quase parada, pontuada por pequenos candles.' },
] as const

export type BackgroundVariant = (typeof backgroundOptions)[number]['value']

export const BACKGROUND_STORAGE_KEY = 'financeiro.background'
export const BACKGROUND_CHANGE_EVENT = 'financeiro:background-change'

export interface BackgroundStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function normalizeBackgroundVariant(value: string | null): BackgroundVariant {
  return backgroundOptions.some((option) => option.value === value) ? (value as BackgroundVariant) : 'market'
}

export function readBackgroundPreference(storage: BackgroundStorage | undefined): BackgroundVariant {
  try {
    return normalizeBackgroundVariant(storage?.getItem(BACKGROUND_STORAGE_KEY) ?? null)
  } catch {
    return 'market'
  }
}

export function writeBackgroundPreference(storage: BackgroundStorage | undefined, value: BackgroundVariant): boolean {
  try {
    storage?.setItem(BACKGROUND_STORAGE_KEY, value)
    return storage !== undefined
  } catch {
    return false
  }
}

const digits = '0123456789'

/** Traduz uma amostra aleatória em um glifo financeiro decorativo. */
export function financialGlyph(sample: number): string {
  const value = Math.min(Math.max(sample, 0), 0.999999)
  if (value < 0.68) return digits[Math.floor(value * 10) % digits.length]!
  if (value < 0.75) return '▲'
  if (value < 0.82) return '▼'
  if (value < 0.9) return '%'
  if (value < 0.96) return '+'
  if (value < 0.985) return '−'
  return '$'
}

export type FinancialGlyphTone = 'up' | 'down' | 'neutral'

/** Liga os sinais do fundo à semântica cromática usada pela bolsa. */
export function financialGlyphTone(glyph: string): FinancialGlyphTone {
  if (glyph === '▲') return 'up'
  if (glyph === '▼') return 'down'
  return 'neutral'
}
