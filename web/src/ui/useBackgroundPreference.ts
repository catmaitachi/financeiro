import { useSyncExternalStore } from 'react'
import {
  BACKGROUND_CHANGE_EVENT,
  BACKGROUND_STORAGE_KEY,
  type BackgroundStorage,
  type BackgroundVariant,
} from './background-options'
import { createBackgroundPreferenceStore, type BackgroundPreferenceChannel } from './background-preference-store'

const browserStorage = (): BackgroundStorage | undefined => {
  try {
    return window.localStorage
  } catch {
    return undefined
  }
}

const browserChannel: BackgroundPreferenceChannel = {
  publish(value) {
    window.dispatchEvent(new CustomEvent(BACKGROUND_CHANGE_EVENT, { detail: value }))
  },
  subscribe(listener) {
    const onChange = (event: Event) => {
      if (event instanceof StorageEvent) {
        if (event.key !== null && event.key !== BACKGROUND_STORAGE_KEY) return
        listener(event.newValue)
      } else if (event instanceof CustomEvent) {
        listener(String(event.detail))
      }
    }

    window.addEventListener(BACKGROUND_CHANGE_EVENT, onChange)
    window.addEventListener('storage', onChange)
    return () => {
      window.removeEventListener(BACKGROUND_CHANGE_EVENT, onChange)
      window.removeEventListener('storage', onChange)
    }
  },
}

let store: ReturnType<typeof createBackgroundPreferenceStore> | undefined
const preferenceStore = () => (store ??= createBackgroundPreferenceStore(browserStorage(), browserChannel))

export function useBackgroundPreference(): BackgroundVariant {
  const current = preferenceStore()
  return useSyncExternalStore(current.subscribe, current.getSnapshot, () => 'market')
}

export function setBackgroundPreference(next: BackgroundVariant) {
  preferenceStore().set(next)
}
