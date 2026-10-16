/** Rotas internas. Cada bloco só valida a entrada e delega ao módulo dono da regra. */
import { Hono } from 'hono'
import { z } from 'zod'
import type { ApiErrorBody, McpConnectionKit, McpInfo, RefreshResult, SetupStatus } from '../../shared/api.ts'
import type { Container } from './container.ts'
import { buildConnectionKit } from './modules/mcp/connection-kit.ts'
import { handleMcpRequest } from './modules/mcp/mcp-server.ts'
import { mcpTools } from './modules/mcp/tools.ts'
import { dateSchema, daySchema, monthSchema, parseBody, parseParam, parseQuery, uuidSchema } from './platform/http/validate.ts'

const idParam = z.coerce.number().int().positive()
const scopeSchema = z.enum(['one', 'future'])
const frequencySchema = z.enum(['monthly', 'weekly', 'daily'])

export function setupRoutes({ credentials, connections }: Container) {
  // O navegador só recebe o estado. Client Secret e API Key nunca saem do servidor.
  const present = async (status: Awaited<ReturnType<typeof credentials.status>>): Promise<SetupStatus> => ({
    ...status,
    hasConnections: connections.count() > 0,
  })

  return new Hono()
    .get('/status', async (c) => c.json(await present(await credentials.status())))
    .post('/test', async (c) => c.json(await present(await credentials.status({ force: true }))))
    .post('/credentials', async (c) => {
      const body = await parseBody(
        c,
        z.object({
          clientId: z.string().min(1, 'Informe o Client ID.'),
          clientSecret: z.string().min(1, 'Informe o Client Secret.'),
        }),
      )
      return c.json(await present(await credentials.save(body)))
    })
    .delete('/credentials', async (c) => c.json(await present(await credentials.remove())))
}

export function pluggyRoutes({ connections }: Container) {
  return new Hono()
    .get('/connections', (c) => c.json(connections.list()))
    .post('/connect-token', async (c) => {
      const body = await parseBody(c, z.object({ itemId: uuidSchema.optional() }))
      return c.json(await connections.connectToken(body.itemId))
    })
    .post('/items', async (c) => {
      const body = await parseBody(c, z.object({ itemId: uuidSchema }))
      await connections.register(body.itemId)
      return c.json(connections.list(), 201)
    })
    .post('/connections/:itemId/refresh', async (c) => {
      const { requested } = await connections.refresh(parseParam(c, 'itemId', uuidSchema))
      return c.json({ requested, connections: connections.list() } satisfies RefreshResult, requested ? 202 : 200)
    })
    .delete('/connections/:itemId', async (c) => {
      await connections.remove(parseParam(c, 'itemId', uuidSchema))
      return c.json(connections.list())
    })
}

export function syncRoutes({ sync }: Container) {
  return new Hono()
    .get('/', (c) => c.json(sync.state()))
    .post('/', async (c) => {
      const body = await parseBody(c, z.object({ trigger: z.enum(['open', 'manual']).default('manual') }))
      return c.json(await sync.run({ trigger: body.trigger }))
    })
}

export function dashboardRoutes({ dashboard }: Container) {
  return new Hono().get('/', (c) => {
    const query = parseQuery(c, z.object({ month: monthSchema.optional(), windowEnd: monthSchema.optional() }))
    return c.json(dashboard.build(query.month, query.windowEnd))
  })
}

export function ledgerRoutes({ ledger }: Container) {
  const transactionQuery = z.object({
    q: z.string().max(120).optional(),
    month: monthSchema.optional(),
    from: dateSchema.optional(),
    to: dateSchema.optional(),
    bankId: z.string().max(48).optional(),
    accountType: z.enum(['BANK', 'CREDIT']).optional(),
    accountId: uuidSchema.optional(),
    categoryId: z.string().max(32).optional(),
    direction: z.enum(['in', 'out']).optional(),
    status: z.enum(['POSTED', 'PENDING']).optional(),
    unidentified: z.stringbool().optional(),
    page: z.coerce.number().int().positive().optional(),
    pageSize: z.coerce.number().int().positive().optional(),
  })

  return new Hono()
    .get('/transactions', (c) => c.json(ledger.listTransactions(parseQuery(c, transactionQuery))))
    .patch('/transactions/:id/override', async (c) => {
      const body = await parseBody(
        c,
        z.object({
          categoryId: z.string().max(32).nullable().optional(),
          includeInTotals: z.boolean().nullable().optional(),
        }),
      )
      ledger.setOverride(parseParam(c, 'id', uuidSchema), body)
      return c.body(null, 204)
    })
    .get('/categories', (c) => c.json(ledger.listCategories()))
    .get('/accounts', (c) => c.json(ledger.listAccounts()))
}

export function forecastRoutes({ forecasts, reconciliation }: Container) {
  // Qualquer mudança em previsões pode criar ou desfazer candidatos de conciliação,
  // então cada alteração termina reavaliando os vínculos.
  return new Hono()
    .get('/', (c) => c.json({ series: forecasts.list(), defaultStartMonth: forecasts.defaultStartMonth() }))
    .post('/', async (c) => {
      const body = await parseBody(
        c,
        z.object({
          expression: z.string().min(1, 'Informe o valor da previsão.').max(40),
          name: z.string().max(80).nullable().optional(),
          frequency: frequencySchema.optional(),
          startMonth: monthSchema.optional(),
          dayOfMonth: z.number().int().min(1).max(31).optional(),
          startDay: daySchema.optional(),
        }),
      )
      const created = forecasts.create(body)
      reconciliation.reconcile()
      return c.json(forecasts.series(created.id), 201)
    })
    .patch('/:id', async (c) => {
      const body = await parseBody(c, z.object({ name: z.string().max(80).nullable() }))
      forecasts.renameSeries(parseParam(c, 'id', idParam), body.name)
      return c.body(null, 204)
    })
    .delete('/:id', (c) => {
      forecasts.deleteSeries(parseParam(c, 'id', idParam))
      reconciliation.reconcile()
      return c.body(null, 204)
    })
    .patch('/occurrences/:id', async (c) => {
      const body = await parseBody(
        c,
        z
          .object({
            scope: scopeSchema,
            amountCents: z
              .number()
              .int()
              .min(-99_999_999_999)
              .max(99_999_999_999)
              .refine((value) => value !== 0, 'O valor da previsão não pode ser zero.')
              .optional(),
            month: monthSchema.optional(),
            day: daySchema.nullable().optional(),
          })
          .refine(
            (value) => value.amountCents !== undefined || value.month !== undefined || value.day !== undefined,
            'Nada para alterar.',
          ),
      )
      forecasts.updateOccurrence(parseParam(c, 'id', idParam), body)
      reconciliation.reconcile()
      return c.body(null, 204)
    })
    .delete('/occurrences/:id', (c) => {
      const query = parseQuery(c, z.object({ scope: scopeSchema.default('one') }))
      forecasts.cancelOccurrence(parseParam(c, 'id', idParam), query.scope)
      reconciliation.reconcile()
      return c.body(null, 204)
    })
    .post('/occurrences/:id/status', async (c) => {
      const body = await parseBody(c, z.object({ status: z.enum(['expected', 'received_manual', 'ignored']) }))
      forecasts.setManualStatus(parseParam(c, 'id', idParam), body.status)
      reconciliation.reconcile()
      return c.body(null, 204)
    })
}

export function reconciliationRoutes({ reconciliation }: Container) {
  return new Hono()
    .get('/', (c) => c.json(reconciliation.queue()))
    .post('/:matchId/confirm', (c) => {
      reconciliation.confirm(parseParam(c, 'matchId', idParam))
      return c.body(null, 204)
    })
    .post('/:matchId/reject', (c) => {
      reconciliation.reject(parseParam(c, 'matchId', idParam))
      return c.body(null, 204)
    })
    .post('/:matchId/undo', (c) => {
      reconciliation.undo(parseParam(c, 'matchId', idParam))
      return c.body(null, 204)
    })
}

export function calendarRoutes({ calendar }: Container) {
  return new Hono().get('/', (c) => {
    const query = parseQuery(c, z.object({ from: daySchema, to: daySchema }))
    return c.json(calendar.events(query.from, query.to))
  })
}

export function subscriptionRoutes({ subscriptions }: Container) {
  const editSchema = z.object({
    name: z.string().min(1, 'Informe o nome da assinatura.').max(80).optional(),
    domain: z.string().max(253).nullable().optional(),
    cadence: z.enum(['weekly', 'monthly', 'yearly']).optional(),
  })
  return new Hono()
    .get('/', (c) => c.json(subscriptions.list()))
    .post('/', async (c) => {
      const body = await parseBody(c, z.object({ transactionId: uuidSchema }))
      return c.json(subscriptions.markTransaction(body.transactionId))
    })
    .post('/:id/confirm', async (c) => c.json(subscriptions.confirm(parseParam(c, 'id', idParam), await parseBody(c, editSchema))))
    .post('/:id/dismiss', (c) => {
      subscriptions.dismiss(parseParam(c, 'id', idParam))
      return c.body(null, 204)
    })
    .post('/:id/end', (c) => {
      subscriptions.end(parseParam(c, 'id', idParam))
      return c.body(null, 204)
    })
    .patch('/:id', async (c) => c.json(subscriptions.update(parseParam(c, 'id', idParam), await parseBody(c, editSchema))))
    .get('/:id/candidates', (c) => {
      const query = parseQuery(c, z.object({ q: z.string().max(120).default('') }))
      return c.json(subscriptions.searchCharges(parseParam(c, 'id', idParam), query.q))
    })
    .post('/:id/charges', async (c) => {
      const body = await parseBody(c, z.object({ transactionId: uuidSchema }))
      return c.json(subscriptions.linkCharge(parseParam(c, 'id', idParam), body.transactionId))
    })
    .delete('/:id/charges/:transactionId', (c) => {
      subscriptions.unlinkCharge(parseParam(c, 'id', idParam), parseParam(c, 'transactionId', uuidSchema))
      return c.body(null, 204)
    })
}

/** Ponto de entrada dos agentes. Exige o token em toda requisição, inclusive de leitura. */
export function mcpRoutes(container: Container) {
  const { mcpToken, settings, logger } = container
  return new Hono().all('/', async (c) => {
    const presented = /^Bearer\s+(\S+)$/i.exec(c.req.header('authorization') ?? '')?.[1] ?? null
    if (!(await mcpToken.verify(presented))) {
      return c.json<ApiErrorBody>(
        { error: { code: 'unauthorized', message: 'Token do MCP ausente ou inválido.' } },
        401,
        { 'WWW-Authenticate': 'Bearer' },
      )
    }
    // Sem sessão não há stream para abrir (GET) nem sessão para encerrar (DELETE).
    if (c.req.method !== 'POST') {
      return c.json<ApiErrorBody>(
        { error: { code: 'method_not_allowed', message: 'O MCP do Financeiro só aceita POST.' } },
        405,
        { Allow: 'POST' },
      )
    }
    return handleMcpRequest(c.req.raw, mcpTools(container, { write: settings.app().mcpWriteEnabled }), logger)
  })
}

/** Administração do acesso dos agentes, usada pela interface. O token inteiro só sai pelo `POST /connection-kit`. */
export function mcpAdminRoutes({ mcpToken, settings, config }: Container) {
  const url = `http://${config.host}:${config.port}/mcp`
  const info = async (): Promise<McpInfo> => ({
    url,
    tokenPreview: await mcpToken.preview(),
    writeEnabled: settings.app().mcpWriteEnabled,
  })

  return new Hono()
    .get('/', async (c) => c.json(await info()))
    // POST de propósito: o `localOnly` confere a origem em métodos que alteram dados, então outra página do navegador não lê o token.
    .post('/connection-kit', async (c) => c.json<McpConnectionKit>(buildConnectionKit({ url, token: await mcpToken.current() })))
    .post('/token', async (c) => {
      await mcpToken.rotate()
      return c.json(await info())
    })
}

export function settingsRoutes({ settings }: Container) {
  return new Hono()
    .get('/', (c) => c.json(settings.app()))
    .patch('/', async (c) => {
      const body = await parseBody(
        c,
        z.object({
          connectScope: z.enum(['meupluggy', 'sandbox', 'all']).optional(),
          mcpWriteEnabled: z.boolean().optional(),
        }),
      )
      return c.json(settings.updateApp(body))
    })
}
