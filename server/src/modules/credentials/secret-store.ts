import type { SecretVault } from '../../../../shared/api.ts'
import type { ProviderCredentials } from '../provider/provider.ts'

export interface StoredSecrets {
  clientId: string | null
  clientSecret: string | null
}

/** Cofre das credenciais cadastradas pela interface. */
export interface SecretStore {
  /** Onde os segredos ficam de fato; a interface usa para dizer a verdade ao usuário. */
  readonly kind: SecretVault
  read(): Promise<StoredSecrets>
  write(credentials: ProviderCredentials): Promise<void>
  clear(): Promise<void>
}

/** Caracteres que o cofre aceita. Também é o que torna segura a citação no `security -i` do Keychain. */
export const SAFE_SECRET = /^[A-Za-z0-9._~+/=-]{1,256}$/

export interface KeychainLabels {
  clientId: string
  clientSecret: string
}

export const PLUGGY_LABELS: KeychainLabels = {
  clientId: 'Financeiro: Pluggy Client ID',
  clientSecret: 'Financeiro: Pluggy Client Secret',
}

/** Cofre volátil: usado em testes. */
export class MemorySecretStore implements SecretStore {
  readonly kind = 'memory'
  #value: StoredSecrets = { clientId: null, clientSecret: null }

  async read() {
    return { ...this.#value }
  }

  async write(credentials: ProviderCredentials) {
    this.#value = { ...credentials }
  }

  async clear() {
    this.#value = { clientId: null, clientSecret: null }
  }
}
