/**
 * Simulador local da API da Pluggy, só para desenvolvimento.
 *
 * Sobe em http://127.0.0.1:8899. Uso: `npm run dev:mock`, depois cadastre em
 * /setup as credenciais de `mock-fixtures.ts` e rode `npm run mock:seed` para
 * conectar as instituições fictícias.
 */
import { serve } from '@hono/node-server'
import { mockPluggy, mockTransactionCount } from './mock-pluggy-app.ts'

const PORT = 8899

serve({ fetch: mockPluggy.fetch, hostname: '127.0.0.1', port: PORT }, () => {
  console.log(`Simulador da Pluggy em http://127.0.0.1:${PORT} (${mockTransactionCount} lançamentos fictícios)`)
})
