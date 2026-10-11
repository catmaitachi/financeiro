import { execFile, spawn } from 'node:child_process'
import type { ProviderCredentials } from '../provider/provider.ts'
import { PLUGGY_LABELS, SAFE_SECRET, type KeychainLabels, type SecretStore, type StoredSecrets } from './secret-store.ts'

/** Rótulos legíveis no app Acesso às Chaves. Só letras, números, espaço e `:.-`, para a citação no `security -i` ser segura. */
const SAFE_LABEL = /^[A-Za-zÀ-ÿ0-9 :.-]{1,80}$/

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
