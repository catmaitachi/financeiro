import { useSyncExternalStore } from 'react'

const STORAGE_KEY = 'financeiro:valores-ocultos'

/** Troca de cada valor monetário quando a privacidade está ligada. */
export const MASK = '—'

const storage = (): Storage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

let hidden = storage()?.getItem(STORAGE_KEY) === '1'
const listeners = new Set<() => void>()

/** Lida pelos formatadores, que não são componentes. */
export const valuesHidden = () => hidden

export function setValuesHidden(next: boolean) {
  hidden = next
  try {
    storage()?.setItem(STORAGE_KEY, next ? '1' : '0')
  } catch {
    // Sem armazenamento a escolha vale só até recarregar.
  }
  listeners.forEach((notify) => notify())
}

const subscribe = (notify: () => void) => {
  listeners.add(notify)
  return () => void listeners.delete(notify)
}

/** Reage à troca: componentes que mostram valores devem chamá-lo (ou estar sob quem chama). */
export function useValuesHidden(): boolean {
  return useSyncExternalStore(subscribe, valuesHidden, () => false)
}
