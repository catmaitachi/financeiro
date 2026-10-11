import type { KeychainLabels, SecretStore } from '../credentials/secret-store.ts'

/** Cofre do token de acesso ao MCP. Separado do cofre da Pluggy: são segredos de donos diferentes. */
export interface McpTokenStore {
  read(): Promise<string | null>
  write(token: string): Promise<void>
}

/** Cofre volátil: usado em testes. */
export class MemoryMcpTokenStore implements McpTokenStore {
  #token: string | null = null

  async read() {
    return this.#token
  }

  async write(token: string) {
    this.#token = token
  }
}

/** O token mora num serviço próprio, ao lado do da Pluggy. */
export const mcpVaultService = (service: string) => `${service}-mcp`

export const MCP_LABELS: KeychainLabels = {
  clientId: 'Financeiro: MCP identificador',
  clientSecret: 'Financeiro: token do MCP',
}

/**
 * Guarda o token num cofre de segredos do sistema. Reaproveita o
 * `SecretStore`, que já resolve a gravação sem expor o segredo na lista de
 * processos; o token ocupa o campo `clientSecret`.
 */
export class VaultMcpTokenStore implements McpTokenStore {
  readonly #store: SecretStore

  constructor(store: SecretStore) {
    this.#store = store
  }

  async read() {
    return (await this.#store.read()).clientSecret
  }

  async write(token: string) {
    await this.#store.write({ clientId: 'mcp', clientSecret: token })
  }
}
