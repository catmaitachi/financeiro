import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

export const DEFAULT_PORT = 8787

/**
 * Carrega um arquivo de variáveis (por padrão `.env`, ou o indicado em
 * `--env-file=<arquivo>`), sem sobrescrever o que já veio do ambiente.
 *
 * É feito aqui, e não pela opção `--env-file` do Node, porque em modo
 * `--watch` aquela opção passa a vigiar a pasta inteira do arquivo: o próprio
 * banco SQLite dispararia reinícios em laço.
 */
export function loadEnvFile(argv: string[] = process.argv) {
  const chosen = argv.find((arg) => arg.startsWith('--env-file='))?.slice('--env-file='.length)
  const file = path.resolve(ROOT, chosen ?? '.env')
  if (fs.existsSync(file)) process.loadEnvFile(file)
  else if (chosen) throw new Error(`Arquivo de ambiente não encontrado: ${file}`)
}

export interface Config {
  rootDir: string
  host: string
  port: number
  dbPath: string
  /** Pasta dos cofres em arquivo (Windows e reserva). Fica ao lado do banco, fora do Git. */
  secretsDir: string
  webDistDir: string
  pluggyApiUrl: string
  keychainService: string
  /** Janela buscada na primeira sincronização de uma conta. */
  initialHistoryDays: number
  /** Janela reavaliada nas sincronizações seguintes (atualizações e exclusões). */
  lookbackDays: number
  /** Ao abrir o painel, não repete uma sincronização mais recente que isto. */
  openSyncMinIntervalMs: number
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const dbPath = path.resolve(ROOT, env.FINANCEIRO_DB_PATH || 'data/financeiro.db')
  return {
    rootDir: ROOT,
    // Uso pessoal: o servidor só escuta na interface de loopback.
    host: '127.0.0.1',
    port: Number(env.FINANCEIRO_PORT) || DEFAULT_PORT,
    dbPath,
    secretsDir: path.join(path.dirname(dbPath), 'secrets'),
    webDistDir: path.join(ROOT, 'web', 'dist'),
    pluggyApiUrl: (env.PLUGGY_API_URL || 'https://api.pluggy.ai').replace(/\/+$/, ''),
    keychainService: env.FINANCEIRO_KEYCHAIN_SERVICE || 'financeiro-pluggy',
    initialHistoryDays: 365,
    lookbackDays: 90,
    openSyncMinIntervalMs: 10 * 60 * 1000,
  }
}
