import {
  normalizeBackgroundVariant,
  readBackgroundPreference,
  writeBackgroundPreference,
  type BackgroundStorage,
  type BackgroundVariant,
} from './background-options.ts'

export interface BackgroundPreferenceChannel {
  publish(value: BackgroundVariant): void
  subscribe(listener: (value: string | null) => void): () => void
}

/** Estado compartilhado entre o canvas e os controles, com persistência opcional. */
export function createBackgroundPreferenceStore(
  storage: BackgroundStorage | undefined,
  channel: BackgroundPreferenceChannel,
) {
  let current = readBackgroundPreference(storage)

  return {
    getSnapshot: () => current,
    set(next: BackgroundVariant) {
      current = next
      writeBackgroundPreference(storage, next)
      channel.publish(next)
    },
    subscribe(notify: () => void) {
      return channel.subscribe((value) => {
        current = normalizeBackgroundVariant(value)
        notify()
      })
    },
  }
}
