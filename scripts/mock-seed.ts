/**
 * Conecta as instituições fictícias do simulador e cria previsões de exemplo.
 * Faz pelo mesmo caminho que a interface: chamando a API local da aplicação.
 *
 * Pré-requisitos: `npm run dev:mock` rodando e as credenciais fictícias
 * (scripts/mock-fixtures.ts) já cadastradas em /setup.
 */
import type { SetupStatus } from '../shared/api.ts'
import { addMonths } from '../shared/months.ts'
import { MOCK_ITEMS } from './mock-fixtures.ts'

const API = `http://localhost:${process.env.FINANCEIRO_PORT || 8787}/api`

async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
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

for (const itemId of Object.values(MOCK_ITEMS)) await call('POST', '/pluggy/items', { itemId })
await call('POST', '/sync', { trigger: 'manual' })

const thisMonth = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date()).slice(0, 7)
const existing = await call<{ series: unknown[] }>('GET', '/forecasts')
if (existing.series.length === 0) {
  const forecasts = [
    // Série mensal que casa com os recebimentos do Ateliê Girassol (baixa automática).
    { expression: '1.200,00*6', name: 'Ateliê Girassol', startMonth: addMonths(thisMonth, -2) },
    // Dois recebimentos iguais no mês passado: ambiguidade para revisão.
    { expression: '450', name: 'Oficina Horizonte', startMonth: addMonths(thisMonth, -1) },
    // Previsto para o mês que vem, recebido adiantado: sugestão "fora do mês".
    { expression: '780', name: 'Editora Cais', startMonth: addMonths(thisMonth, 1) },
    // Parcelado, ainda por receber.
    { expression: '2.500,00/3', name: 'Projeto Casa Alta', startMonth: thisMonth },
  ]
  for (const forecast of forecasts) await call('POST', '/forecasts', forecast)
}
await call('POST', '/sync', { trigger: 'manual' })
console.log('Instituições fictícias conectadas e previsões de exemplo criadas.')
