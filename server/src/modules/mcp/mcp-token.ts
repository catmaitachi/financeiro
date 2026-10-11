import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'
import type { McpTokenStore } from './token-store.ts'

const digest = (value: string) => createHash('sha256').update(value).digest()

/**
 * Token que os agentes apresentam em `Authorization: Bearer`. Guardado no
 * cofre e mantido em memória para não consultar o cofre a cada requisição.
 */
export class McpTokenService {
  readonly #store: McpTokenStore
  #cached: Promise<string> | null = null

  constructor(store: McpTokenStore) {
    this.#store = store
  }

  /** Devolve o token atual, criando-o na primeira vez. */
  current(): Promise<string> {
    this.#cached ??= this.#load().catch((error) => {
      this.#cached = null
      throw error
    })
    return this.#cached
  }

  /** Gera um token novo. O anterior deixa de valer imediatamente. */
  async rotate(): Promise<string> {
    const token = generate()
    await this.#store.write(token)
    this.#cached = Promise.resolve(token)
    return token
  }

  /** Comparação em tempo constante, para o tempo de resposta não revelar o token. */
  async verify(presented: string | null): Promise<boolean> {
    if (!presented) return false
    return timingSafeEqual(digest(presented), digest(await this.current()))
  }

  /** Versão que dá para exibir: começo e fim, sem o miolo. */
  async preview(): Promise<string> {
    const token = await this.current()
    return `${token.slice(0, 8)}…${token.slice(-4)}`
  }

  async #load(): Promise<string> {
    const stored = await this.#store.read()
    if (stored) return stored
    const token = generate()
    await this.#store.write(token)
    return token
  }
}

function generate(): string {
  return `fin_${randomBytes(32).toString('base64url')}`
}
