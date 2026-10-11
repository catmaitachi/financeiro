import type { ProviderCredentials } from '../provider/provider.ts'
import { runCommand, type CommandRunner } from './run-command.ts'
import { PLUGGY_LABELS, type KeychainLabels, type SecretStore, type StoredSecrets } from './secret-store.ts'

const SECRET_TOOL = 'secret-tool'
/** O `secret-tool` devolve 1 quando não há item e 2 quando o chaveiro falha. */
const NOT_FOUND = 1
const ACCOUNTS = { clientId: 'client-id', clientSecret: 'client-secret' } as const

/**
 * Linux: chaveiro do sistema (GNOME Keyring, KWallet e outros que falam
 * Secret Service), via utilitário `secret-tool` do libsecret.
 *
 * O segredo vai pela entrada padrão, que é como o `secret-tool store` o lê.
 */
export class LibsecretSecretStore implements SecretStore {
  readonly kind = 'libsecret'
  readonly #service: string
  readonly #labels: KeychainLabels
  readonly #run: CommandRunner

  constructor(service: string, labels: KeychainLabels = PLUGGY_LABELS, run: CommandRunner = runCommand) {
    this.#service = service
    this.#labels = labels
    this.#run = run
  }

  async read(): Promise<StoredSecrets> {
    const [clientId, clientSecret] = await Promise.all([
      this.#lookup(ACCOUNTS.clientId),
      this.#lookup(ACCOUNTS.clientSecret),
    ])
    return { clientId, clientSecret }
  }

  async write(credentials: ProviderCredentials) {
    for (const field of ['clientId', 'clientSecret'] as const) {
      const result = await this.#tool(
        ['store', `--label=${this.#labels[field]}`, ...this.#attributes(ACCOUNTS[field])],
        credentials[field],
      )
      if (result.code !== 0) throw new Error('O chaveiro do sistema recusou a gravação das credenciais.')
    }
  }

  async clear() {
    for (const account of Object.values(ACCOUNTS)) {
      const result = await this.#tool(['clear', ...this.#attributes(account)])
      if (result.code !== 0 && result.code !== NOT_FOUND) {
        throw new Error('Não foi possível remover as credenciais do chaveiro do sistema.')
      }
    }
  }

  async #lookup(account: string): Promise<string | null> {
    const result = await this.#tool(['lookup', ...this.#attributes(account)])
    if (result.code === 0) return result.stdout.replace(/\n$/, '') || null
    if (result.code === NOT_FOUND) return null
    throw new Error('Não foi possível ler o chaveiro do sistema.')
  }

  #attributes(account: string) {
    return ['service', this.#service, 'account', account]
  }

  async #tool(args: string[], stdin?: string) {
    try {
      return await this.#run(SECRET_TOOL, args, stdin)
    } catch {
      throw new Error('O utilitário secret-tool não está disponível.')
    }
  }
}
