import type { CredentialSource as SourceName } from '../../../../shared/api.ts'
import type { ProviderCredentials } from '../provider/provider.ts'
import type { SecretStore } from './secret-store.ts'

export type ResolvedCredentials =
  | { state: 'complete'; source: SourceName; credentials: ProviderCredentials }
  | { state: 'incomplete' }
  | { state: 'missing' }

/**
 * Localiza as credenciais ativas, nesta ordem:
 *   1. cofre do sistema (cadastradas pela interface);
 *   2. variáveis de ambiente locais (alternativa para desenvolvimento).
 */
export class CredentialSource {
  readonly #store: SecretStore
  readonly #env: NodeJS.ProcessEnv

  constructor(store: SecretStore, env: NodeJS.ProcessEnv) {
    this.#store = store
    this.#env = env
  }

  async resolve(): Promise<ResolvedCredentials> {
    const stored = await this.#store.read()
    if (stored.clientId && stored.clientSecret) {
      return {
        state: 'complete',
        source: 'vault',
        credentials: { clientId: stored.clientId, clientSecret: stored.clientSecret },
      }
    }

    const clientId = (this.#env.PLUGGY_CLIENT_ID ?? this.#env.CLIENT_ID)?.trim()
    const clientSecret = (this.#env.PLUGGY_CLIENT_SECRET ?? this.#env.CLIENT_SECRET)?.trim()
    if (clientId && clientSecret) {
      return { state: 'complete', source: 'env', credentials: { clientId, clientSecret } }
    }

    const partial = stored.clientId || stored.clientSecret || clientId || clientSecret
    return { state: partial ? 'incomplete' : 'missing' }
  }

  /** Usado pelo adaptador do provedor a cada autenticação. */
  async active(): Promise<ProviderCredentials | null> {
    const resolved = await this.resolve()
    return resolved.state === 'complete' ? resolved.credentials : null
  }
}
