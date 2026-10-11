import { execFile, spawn } from 'node:child_process'
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

/** Caracteres que o cofre aceita. Também é o que torna segura a citação no `security -i`. */
export const SAFE_SECRET = /^[A-Za-z0-9._~+/=-]{1,256}$/

/** Rótulos legíveis no app Acesso às Chaves. Só letras, números, espaço e `:.-`, para a citação no `security -i` ser segura. */
const SAFE_LABEL = /^[A-Za-zÀ-ÿ0-9 :.-]{1,80}$/

export interface KeychainLabels {
  clientId: string
  clientSecret: string
}

export const PLUGGY_LABELS: KeychainLabels = {
  clientId: 'Financeiro: Pluggy Client ID',
  clientSecret: 'Financeiro: Pluggy Client Secret',
}

const SECURITY = '/usr/bin/security'
const NOT_FOUND = 44
const ACCOUNTS = { clientId: 'client-id', clientSecret: 'client-secret' } as const

/**
 * macOS Keychain, via utilitário `security` do sistema.
 *
 * A gravação usa o modo interativo (`security -i`) e envia o comando pela
 * entrada padrão: assim o segredo nunca aparece na lista de processos, como
 * aconteceria se fosse passado em `-w <valor>` na linha de comando.
 */
export class KeychainSecretStore implements SecretStore {
  readonly kind = 'keychain'
  readonly #service: string
  readonly #labels: KeychainLabels

  constructor(service: string, labels: KeychainLabels = PLUGGY_LABELS) {
    if (!SAFE_SECRET.test(service)) throw new Error('Nome de serviço do Keychain inválido.')
    if (!SAFE_LABEL.test(labels.clientId) || !SAFE_LABEL.test(labels.clientSecret)) {
      throw new Error('Rótulo do Keychain inválido.')
    }
    this.#service = service
    this.#labels = labels
  }

  async read(): Promise<StoredSecrets> {
    const [clientId, clientSecret] = await Promise.all([
      this.#find(ACCOUNTS.clientId),
      this.#find(ACCOUNTS.clientSecret),
    ])
    return { clientId, clientSecret }
  }

  async write(credentials: ProviderCredentials) {
    if (!SAFE_SECRET.test(credentials.clientId) || !SAFE_SECRET.test(credentials.clientSecret)) {
      throw new Error('Credencial com caracteres não suportados pelo Keychain.')
    }
    await this.#interactive(
      [
        `add-generic-password -U -s "${this.#service}" -a "${ACCOUNTS.clientId}" -l "${this.#labels.clientId}" -w "${credentials.clientId}"`,
        `add-generic-password -U -s "${this.#service}" -a "${ACCOUNTS.clientSecret}" -l "${this.#labels.clientSecret}" -w "${credentials.clientSecret}"`,
      ].join('\n') + '\n',
    )
  }

  async clear() {
    await Promise.all(Object.values(ACCOUNTS).map((account) => this.#delete(account)))
  }

  #find(account: string): Promise<string | null> {
    return new Promise((resolve, reject) => {
      execFile(
        SECURITY,
        ['find-generic-password', '-s', this.#service, '-a', account, '-w'],
        (error, stdout) => {
          if (!error) return resolve(stdout.replace(/\n$/, '') || null)
          if (error.code === NOT_FOUND) return resolve(null)
          reject(new Error('Não foi possível ler o macOS Keychain.'))
        },
      )
    })
  }

  #delete(account: string): Promise<void> {
    return new Promise((resolve, reject) => {
      execFile(SECURITY, ['delete-generic-password', '-s', this.#service, '-a', account], (error) => {
        if (!error || error.code === NOT_FOUND) return resolve()
        reject(new Error('Não foi possível remover as credenciais do macOS Keychain.'))
      })
    })
  }

  #interactive(commands: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(SECURITY, ['-i'], { stdio: ['pipe', 'ignore', 'ignore'] })
      child.on('error', () => reject(new Error('Não foi possível acessar o macOS Keychain.')))
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new Error('O macOS Keychain recusou a gravação das credenciais.')),
      )
      child.stdin.end(commands)
    })
  }
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
