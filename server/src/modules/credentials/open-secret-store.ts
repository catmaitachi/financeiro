import { DpapiSecretStore } from './dpapi-secret-store.ts'
import { FileSecretStore } from './file-secret-store.ts'
import { LibsecretSecretStore } from './libsecret-secret-store.ts'
import type { CommandRunner } from './run-command.ts'
import { KeychainSecretStore, type KeychainLabels, type SecretStore, type StoredSecrets } from './secret-store.ts'

export interface SecretStoreOptions {
  service: string
  /** Pasta dos cofres em arquivo. */
  dir: string
  /** Rótulos exibidos nos chaveiros que mostram os itens ao usuário. */
  labels?: KeychainLabels
  platform?: NodeJS.Platform
  run?: CommandRunner
}

/**
 * Escolhe o cofre do sistema em que o servidor está rodando:
 * Keychain no macOS, DPAPI no Windows, Secret Service no Linux.
 *
 * No Linux o chaveiro pode não existir (servidor sem sessão gráfica, WSL,
 * contêiner); uma leitura de prova decide. Sem ele, e em qualquer outro
 * sistema, vale o arquivo local com permissão restrita. Quando o chaveiro
 * passa a existir, o que estava no arquivo é levado para ele.
 */
export async function openSecretStore(options: SecretStoreOptions): Promise<SecretStore> {
  const platform = options.platform ?? process.platform
  if (platform === 'darwin') return new KeychainSecretStore(options.service, options.labels)
  if (platform === 'win32') return new DpapiSecretStore(options.service, options.dir, options.run)
  const fallback = new FileSecretStore(options.service, options.dir)
  if (platform === 'linux') {
    const keyring = new LibsecretSecretStore(options.service, options.labels, options.run)
    const found = await keyring.read().catch(() => null)
    if (found && (await adoptFile(keyring, found, fallback))) return keyring
  }
  return fallback
}

/**
 * Leva para o chaveiro o que ficou no arquivo de reserva e apaga o arquivo,
 * para não sobrar segredo sem cifra. O que já está no chaveiro prevalece.
 * Devolve `false` se a mudança falhar: aí o arquivo continua valendo.
 */
async function adoptFile(keyring: SecretStore, found: StoredSecrets, file: SecretStore): Promise<boolean> {
  try {
    const left = await file.read()
    if (!left.clientId || !left.clientSecret) return true
    if (!found.clientId && !found.clientSecret) {
      await keyring.write({ clientId: left.clientId, clientSecret: left.clientSecret })
    }
    await file.clear()
    return true
  } catch {
    return false
  }
}
