import { Hono, type MiddlewareHandler } from 'hono'
import { ForecastExpressionError } from '../../shared/forecast-expression.ts'
import type { ApiErrorBody } from '../../shared/api.ts'
import type { Container } from './container.ts'
import { ProviderError, type ProviderErrorKind } from './modules/provider/provider.ts'
import { AppError } from './platform/http/errors.ts'
import { noStore } from './platform/http/security.ts'
import {
  dashboardRoutes,
  forecastRoutes,
  ledgerRoutes,
  mcpAdminRoutes,
  mcpRoutes,
  pluggyRoutes,
  calendarRoutes,
  reconciliationRoutes,
  subscriptionRoutes,
  settingsRoutes,
  setupRoutes,
  syncRoutes,
} from './routes.ts'

const PROVIDER_STATUS: Record<ProviderErrorKind, 401 | 404 | 429 | 502 | 503> = {
  invalid_credentials: 401,
  missing_credentials: 401,
  not_found: 404,
  rate_limited: 429,
  unavailable: 503,
  network: 503,
  unexpected: 502,
}

/**
 * A API e o `/mcp`, sem nada que dependa do Node: é o que o servidor local e
 * a demo no navegador têm em comum. `guards` roda antes de tudo.
 */
export function createApi(container: Container, guards: MiddlewareHandler[] = []) {
  const app = new Hono()
  for (const guard of guards) app.use(guard)

  const api = new Hono()
  api.use(noStore)
  api.route('/setup', setupRoutes(container))
  api.route('/pluggy', pluggyRoutes(container))
  api.route('/sync', syncRoutes(container))
  api.route('/dashboard', dashboardRoutes(container))
  api.route('/forecasts', forecastRoutes(container))
  api.route('/reconciliation', reconciliationRoutes(container))
  api.route('/subscriptions', subscriptionRoutes(container))
  api.route('/calendar', calendarRoutes(container))
  api.route('/settings', settingsRoutes(container))
  api.route('/mcp', mcpAdminRoutes(container))
  api.route('/', ledgerRoutes(container))
  api.notFound((c) => c.json<ApiErrorBody>({ error: { code: 'not_found', message: 'Rota não encontrada.' } }, 404))
  app.route('/api', api)

  const mcp = new Hono()
  mcp.use(noStore)
  mcp.route('/', mcpRoutes(container))
  app.route('/mcp', mcp)

  app.onError((error, c) => {
    if (error instanceof AppError) {
      return c.json<ApiErrorBody>(
        { error: { code: error.code, message: error.message, details: error.details } },
        error.status,
      )
    }
    if (error instanceof ForecastExpressionError) {
      return c.json<ApiErrorBody>({ error: { code: `forecast_${error.code}`, message: error.message } }, 422)
    }
    if (error instanceof ProviderError) {
      // `credentials_required` faz a interface levar a pessoa de volta a /setup.
      const credentials = error.kind === 'invalid_credentials' || error.kind === 'missing_credentials'
      if (error.kind === 'invalid_credentials') container.credentials.markRejected()
      return c.json<ApiErrorBody>(
        { error: { code: credentials ? 'credentials_required' : `provider_${error.kind}`, message: error.message } },
        PROVIDER_STATUS[error.kind],
      )
    }
    container.logger.error('Erro não tratado.', { path: c.req.path, reason: error.message })
    return c.json<ApiErrorBody>(
      { error: { code: 'internal_error', message: 'Algo deu errado aqui dentro. Tente de novo.' } },
      500,
    )
  })

  return app
}
