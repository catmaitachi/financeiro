import type { SecretVault } from '@shared/api'

/** Onde o servidor guarda as credenciais, já com a preposição: "Guardadas no Keychain do macOS". */
const PLACES: Record<SecretVault, string> = {
  keychain: 'no Keychain do macOS',
  dpapi: 'em arquivo cifrado pelo Windows',
  libsecret: 'no chaveiro do sistema',
  file: 'em arquivo local de acesso restrito',
  memory: 'só na memória',
}

export function vaultPlace(vault: SecretVault | undefined): string {
  return vault ? PLACES[vault] : 'no cofre do sistema'
}
