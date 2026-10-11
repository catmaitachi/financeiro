import path from 'node:path'
import type { ProviderCredentials } from '../provider/provider.ts'
import { decodeSecrets, encodeSecrets, readVaultFile, removeVaultFile, vaultFile, writeVaultFile } from './file-secret-store.ts'
import { runCommand, type CommandRunner } from './run-command.ts'
import type { SecretStore, StoredSecrets } from './secret-store.ts'

/** Windows PowerShell 5.1, presente em todo Windows 10 e 11. Caminho absoluto, para não depender do PATH. */
const POWERSHELL = path.win32.join(
  process.env.SystemRoot ?? 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
)

/** Entra e sai em Base64 pela entrada e saída padrão: nada sensível nos argumentos, nada a perder com a codificação do console. */
const script = (method: 'Protect' | 'Unprotect') =>
  [
    "$ErrorActionPreference='Stop'",
    'Add-Type -AssemblyName System.Security',
    '$data=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim())',
    `$out=[System.Security.Cryptography.ProtectedData]::${method}($data,$null,[System.Security.Cryptography.DataProtectionScope]::CurrentUser)`,
    '[Console]::Out.Write([Convert]::ToBase64String($out))',
  ].join(';')

/**
 * Windows: arquivo cifrado pela DPAPI para o usuário atual.
 *
 * A chave é do próprio Windows e está presa à conta: o arquivo copiado para
 * outra máquina ou aberto por outro usuário não pode ser decifrado.
 */
export class DpapiSecretStore implements SecretStore {
  readonly kind = 'dpapi'
  readonly #file: string
  readonly #run: CommandRunner

  constructor(service: string, dir: string, run: CommandRunner = runCommand) {
    this.#file = vaultFile(dir, service, 'dpapi')
    this.#run = run
  }

  async read(): Promise<StoredSecrets> {
    const sealed = await readVaultFile(this.#file)
    if (sealed === null) return { clientId: null, clientSecret: null }
    try {
      return decodeSecrets(Buffer.from(await this.#dpapi('Unprotect', sealed), 'base64').toString('utf8'))
    } catch {
      throw new Error('Não foi possível ler o cofre do Windows.')
    }
  }

  async write(credentials: ProviderCredentials) {
    const plain = Buffer.from(encodeSecrets(credentials), 'utf8').toString('base64')
    let sealed: string
    try {
      sealed = await this.#dpapi('Protect', plain)
    } catch {
      throw new Error('O Windows recusou a gravação das credenciais.')
    }
    await writeVaultFile(this.#file, sealed)
  }

  async clear() {
    await removeVaultFile(this.#file)
  }

  async #dpapi(method: 'Protect' | 'Unprotect', input: string): Promise<string> {
    const result = await this.#run(POWERSHELL, ['-NoProfile', '-NonInteractive', '-Command', script(method)], input)
    const output = result.stdout.trim()
    if (result.code !== 0 || !output) throw new Error('DPAPI falhou.')
    return output
  }
}
