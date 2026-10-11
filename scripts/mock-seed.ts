/**
 * Conecta as instituições fictícias do simulador e cria previsões de exemplo.
 * Faz pelo mesmo caminho que a interface: chamando a API local da aplicação.
 *
 * Pré-requisitos: `npm run dev:mock` rodando e as credenciais fictícias
 * (scripts/mock-fixtures.ts) já cadastradas em /setup.
 */
import type { SetupStatus } from '../shared/api.ts'
import { seedMockData, type ApiCall } from './mock-seed-steps.ts'

const API = `http://localhost:${process.env.FINANCEIRO_PORT || 8787}/api`

const call: ApiCall = async <T>(method: string, path: string, body?: unknown): Promise<T> => {
  const response = await fetch(API + path, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${method} ${path} -> ${response.status} ${await response.text()}`)
  return (response.status === 204 ? null : await response.json()) as T
}

const status = await call<SetupStatus>('GET', '/setup/status')
if (status.state !== 'valid') {
  console.error('Cadastre antes as credenciais fictícias em http://localhost:5173/setup (veja scripts/mock-fixtures.ts).')
  process.exit(1)
}

await seedMockData(call)
console.log('Instituições fictícias conectadas e previsões de exemplo criadas.')
