/** Cores de destaque dos bancos conhecidos, iguais às usadas nos selos. */
const BRAND_TONES: Record<string, string> = {
  nubank: 'bg-brand-nubank',
  inter: 'bg-brand-inter',
  picpay: 'bg-brand-picpay',
}

/** Fallback legível para instituições sem uma cor de marca cadastrada. */
const FALLBACK_TONES = ['bg-series-1', 'bg-series-2', 'bg-series-3', 'bg-series-4'] as const

export type BankTones = (bankId: string) => string

export function bankTones(bankIds: readonly string[]): BankTones {
  const unknown = [...new Set(bankIds)].filter((bankId) => !BRAND_TONES[bankId]).sort()
  return (bankId) => {
    const brand = BRAND_TONES[bankId]
    if (brand) return brand
    const index = unknown.indexOf(bankId)
    return FALLBACK_TONES[index < 0 ? FALLBACK_TONES.length - 1 : Math.min(index, FALLBACK_TONES.length - 1)]!
  }
}
