import fs from 'node:fs'
import path from 'node:path'
import { Hono } from 'hono'
import { ForecastExpressionError } from '../../shared/forecast-expression.ts'
import type { ApiErrorBody } from '../../shared/api.ts'
import type { Container } from './container.ts'
import { ProviderError, type ProviderErrorKind } from './modules/provider/provider.ts'
import { AppError } from './platform/http/errors.ts'
import { localOnly, noStore } from './platform/http/security.ts'
import {
  dashboardRoutes,
  forecastRoutes,
  ledgerRoutes,
  mcpAdminRoutes,
  mcpRoutes,
  pluggyRoutes,
  reconciliationRoutes,
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

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export function createApp(container: Container) {
  const app = new Hono()
  app.use(localOnly)

  const api = new Hono()
  api.use(noStore)
  api.route('/setup', setupRoutes(container))
  api.route('/pluggy', pluggyRoutes(container))
  api.route('/sync', syncRoutes(container))
  api.route('/dashboard', dashboardRoutes(container))
  api.route('/forecasts', forecastRoutes(container))
  api.route('/reconciliation', reconciliationRoutes(container))
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

  serveInterface(app, container.config.webDistDir)
  return app
}

/** Em produção local, o mesmo servidor entrega a interface já compilada. */
function serveInterface(app: Hono, distDir: string) {
  app.get('*', (c) => {
    const index = path.join(distDir, 'index.html')
    if (!fs.existsSync(index)) {
      return c.text('Interface ainda não compilada. Rode "npm run build" ou use "npm run dev".', 503)
    }
    const requested = path.normalize(path.join(distDir, decodeURIComponent(c.req.path)))
    const inside = requested.startsWith(distDir + path.sep)
    const file = inside && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : index
    const immutable = file !== index && file.includes(`${path.sep}assets${path.sep}`)
    return c.body(fs.readFileSync(file), 200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
  })
}
