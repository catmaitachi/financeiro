import fs from 'node:fs/promises'
import path from 'node:path'
import type { ProviderCredentials } from '../provider/provider.ts'
import type { SecretStore, StoredSecrets } from './secret-store.ts'

/** O nome do serviço vira nome de arquivo: nada de barras ou pontos. */
const SAFE_FILE_NAME = /^[A-Za-z0-9_-]{1,64}$/

const EMPTY: StoredSecrets = { clientId: null, clientSecret: null }

/** Caminho do cofre de um serviço dentro da pasta de segredos. */
export function vaultFile(dir: string, service: string, extension: string): string {
  if (!SAFE_FILE_NAME.test(service)) throw new Error('Nome de serviço do cofre inválido.')
  return path.join(dir, `${service}.${extension}`)
}

export async function readVaultFile(file: string): Promise<string | null> {
  try {
    return await fs.readFile(file, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw new Error('Não foi possível ler o arquivo do cofre.')
  }
}

/** Grava só para o dono e troca o arquivo de uma vez, para nunca deixar um cofre pela metade. */
export async function writeVaultFile(file: string, content: string) {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 })
  const temporary = `${file}.${process.pid}.tmp`
  await fs.writeFile(temporary, content, { mode: 0o600 })
  await fs.rename(temporary, file)
}

export function removeVaultFile(file: string) {
  return fs.rm(file, { force: true })
}

export function encodeSecrets(credentials: ProviderCredentials): string {
  return JSON.stringify({ clientId: credentials.clientId, clientSecret: credentials.clientSecret })
}

export function decodeSecrets(text: string): StoredSecrets {
  const value = JSON.parse(text) as Partial<StoredSecrets>
  return {
    clientId: typeof value.clientId === 'string' ? value.clientId : null,
    clientSecret: typeof value.clientSecret === 'string' ? value.clientSecret : null,
  }
}

/**
 * Reserva para sistemas sem cofre: arquivo local legível apenas pelo dono.
 *
 * O conteúdo não é cifrado. A proteção é a permissão do arquivo, a mesma de
 * um `.env`; quem lê os arquivos da sua conta lê também este.
 */
export class FileSecretStore implements SecretStore {
  readonly kind = 'file'
  readonly #file: string

  constructor(service: string, dir: string) {
    this.#file = vaultFile(dir, service, 'json')
  }

  async read(): Promise<StoredSecrets> {
    const text = await readVaultFile(this.#file)
    if (text === null) return { ...EMPTY }
    try {
      return decodeSecrets(text)
    } catch {
      throw new Error('O arquivo do cofre está corrompido.')
    }
  }

  async write(credentials: ProviderCredentials) {
    await writeVaultFile(this.#file, encodeSecrets(credentials))
  }

  async clear() {
    await removeVaultFile(this.#file)
  }
}
