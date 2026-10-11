import type { CredentialSource as SourceName, CredentialState, SecretVault } from '../../../../shared/api.ts'
import { AppError } from '../../platform/http/errors.ts'
import type { Logger } from '../../platform/logger.ts'
import type { Clock } from '../../platform/time.ts'
import { ProviderError, type FinancialProvider, type ProviderCredentials } from '../provider/provider.ts'
import type { SettingsRepo } from '../settings/settings-repo.ts'
import type { CredentialSource } from './credential-source.ts'
import { SAFE_SECRET, type SecretStore } from './secret-store.ts'

export interface CredentialStatus {
  state: CredentialState
  source: SourceName | null
  vault: SecretVault
  checkedAt: string | null
}

interface Verdict {
  state: 'valid' | 'invalid' | 'unreachable'
  checkedAt: number
}

/** Uma checagem positiva vale por este tempo; cada checagem gera uma API Key na Pluggy. */
const VALID_FOR_MS = 30 * 60 * 1000
/** Falha de rede não condena as credenciais: tenta de novo logo. */
const UNREACHABLE_FOR_MS = 30 * 1000

const CLIENT_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Deps {
  source: CredentialSource
  store: SecretStore
  provider: FinancialProvider
  settings: SettingsRepo
  clock: Clock
  logger: Logger
}

export class CredentialsService {
  readonly #deps: Deps
  #verdict: Verdict | null = null

  constructor(deps: Deps) {
    this.#deps = deps
  }

  /** Estado atual, reaproveitando a última checagem enquanto ela for recente. */
  async status(options: { force?: boolean } = {}): Promise<CredentialStatus> {
    const resolved = await this.#deps.source.resolve()
    this.#deps.settings.write('credential_source', resolved.state === 'complete' ? resolved.source : 'none')
    if (resolved.state !== 'complete') {
      this.#verdict = null
      return { state: resolved.state, source: null, vault: this.#deps.store.kind, checkedAt: null }
    }

    const now = this.#deps.clock().getTime()
    const verdict = this.#verdict
    const fresh =
      verdict &&
      !options.force &&
      (verdict.state === 'invalid' ||
        now - verdict.checkedAt < (verdict.state === 'valid' ? VALID_FOR_MS : UNREACHABLE_FOR_MS))
    if (!fresh) this.#verdict = { state: await this.#check(resolved.credentials), checkedAt: now }

    return {
      state: this.#verdict!.state,
      source: resolved.source,
      vault: this.#deps.store.kind,
      checkedAt: new Date(this.#verdict!.checkedAt).toISOString(),
    }
  }

  /**
   * Valida o par com a Pluggy e só então grava no cofre.
   * Credenciais recusadas nunca são persistidas.
   */
  async save(input: { clientId: string; clientSecret: string }): Promise<CredentialStatus> {
    const credentials = { clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim() }
    if (!CLIENT_ID.test(credentials.clientId)) {
      throw new AppError(
        422,
        'invalid_client_id',
        'O Client ID deve ter o formato xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx. Copie-o inteiro do Pluggy Dashboard.',
      )
    }
    if (!SAFE_SECRET.test(credentials.clientSecret) || credentials.clientSecret.length < 8) {
      throw new AppError(
        422,
        'invalid_client_secret',
        'O Client Secret parece incompleto. Copie-o inteiro do Pluggy Dashboard, sem espaços.',
      )
    }

    try {
      await this.#deps.provider.verifyCredentials(credentials)
    } catch (error) {
      if (error instanceof ProviderError && error.kind === 'invalid_credentials') {
        throw new AppError(
          422,
          'credentials_rejected',
          'A Pluggy recusou este par de credenciais. Confira se o Client ID e o Client Secret são da mesma Application e tente de novo.',
        )
      }
      throw new AppError(
        503,
        'provider_unreachable',
        'Não consegui falar com a Pluggy para validar as credenciais, então nada foi salvo. Verifique sua conexão e tente de novo.',
      )
    }

    await this.#deps.store.write(credentials)
    this.#deps.provider.resetSession()
    this.#verdict = { state: 'valid', checkedAt: this.#deps.clock().getTime() }
    this.#deps.logger.info('Credenciais da Pluggy validadas e guardadas no cofre.')
    return this.status()
  }

  /** Remove do cofre. Os dados financeiros locais permanecem intactos. */
  async remove(): Promise<CredentialStatus> {
    await this.#deps.store.clear()
    this.#deps.provider.resetSession()
    this.#verdict = null
    this.#deps.logger.info('Credenciais da Pluggy removidas do cofre.')
    return this.status()
  }

  /** Chamado quando uma operação real descobre que as credenciais deixaram de valer. */
  markRejected() {
    this.#verdict = { state: 'invalid', checkedAt: this.#deps.clock().getTime() }
  }

  async #check(credentials: ProviderCredentials): Promise<Verdict['state']> {
    try {
      await this.#deps.provider.verifyCredentials(credentials)
      return 'valid'
    } catch (error) {
      return error instanceof ProviderError && error.kind === 'invalid_credentials' ? 'invalid' : 'unreachable'
    }
  }
}
