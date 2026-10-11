import type { McpTokenStore } from './token-store.ts'

// Web Crypto, e não `node:crypto`: o mesmo módulo roda no Node e no navegador (demo).
const digest = async (value: string) =>
  new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))

/** Compara sem sair no primeiro byte diferente. Os dois lados são resumos de mesmo tamanho. */
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  let difference = a.length ^ b.length
  for (let i = 0; i < a.length; i++) difference |= a[i]! ^ (b[i] ?? 0)
  return difference === 0
}

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
    return sameBytes(await digest(presented), await digest(await this.current()))
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
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  const base64 = btoa(String.fromCharCode(...bytes))
  return `fin_${base64.replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')}`
}
