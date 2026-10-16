import type { SetupStatus, SubscriptionList } from '../shared/api.ts'
import { addDays, weekdayOf } from '../shared/days.ts'
import { addMonths } from '../shared/months.ts'
import { MOCK_ITEMS } from './mock-fixtures.ts'

/** Chama a API da aplicação: por HTTP no modo mock local, direto em memória na demo. */
export type ApiCall = <T>(method: string, path: string, body?: unknown) => Promise<T>

/**
 * Conecta as instituições fictícias do simulador e cria previsões de exemplo,
 * pelo mesmo caminho que a interface: a API da aplicação.
 */
export async function seedMockData(call: ApiCall) {
  const status = await call<SetupStatus>('GET', '/setup/status')
  if (status.state !== 'valid') throw new Error('As credenciais fictícias ainda não foram cadastradas.')

  for (const itemId of Object.values(MOCK_ITEMS)) await call('POST', '/pluggy/items', { itemId })
  await call('POST', '/sync', { trigger: 'manual' })

  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
  const thisMonth = today.slice(0, 7)
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
      // Com dia: aparecem no calendário.
      { expression: '-189,90!', name: 'Seguro do carro', startMonth: thisMonth, dayOfMonth: 25 },
      { expression: '-120!', name: 'Feira da semana', frequency: 'weekly', startDay: nextFriday(today) },
    ]
    for (const forecast of forecasts) await call('POST', '/forecasts', forecast)
  }
  await call('POST', '/sync', { trigger: 'manual' })

  // Duas assinaturas confirmadas; as demais ficam na fila, esperando o usuário.
  const { subscriptions } = await call<SubscriptionList>('GET', '/subscriptions')
  for (const subscription of subscriptions) {
    if (subscription.status === 'suggested' && ['Netflix', 'Tela Mais'].includes(subscription.name)) {
      await call('POST', `/subscriptions/${subscription.id}/confirm`, {})
    }
  }
}

/** A próxima sexta-feira, a partir de amanhã. */
function nextFriday(today: string): string {
  return addDays(today, ((5 - weekdayOf(today) + 6) % 7) + 1)
}
