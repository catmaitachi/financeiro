import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { connectionHealth } from '../src/modules/connections/health.ts'
import { normalizeAccount, normalizeBill, normalizeTransaction } from '../src/modules/provider/pluggy/normalize.ts'
import { PluggyProvider } from '../src/modules/provider/pluggy/pluggy-provider.ts'
import { ProviderError } from '../src/modules/provider/provider.ts'
import { bankAccount, cardAccount, VALID } from './support.ts'

interface Call {
  method: string
  path: string
  query: Record<string, string>
  apiKey: string | null
  body: unknown
}

/** `fetch` falso: registra as chamadas e responde com o roteiro informado. */
function fakeFetch(handler: (call: Call) => { status?: number; body?: unknown } | Promise<never>) {
  const calls: Call[] = []
  const fetchLike = async (input: string, init?: RequestInit) => {
    const url = new URL(input)
    const call: Call = {
      method: init?.method ?? 'GET',
      path: url.pathname,
      query: Object.fromEntries(url.searchParams),
      apiKey: (init?.headers as Record<string, string>)['X-API-KEY'] ?? null,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    const result = await handler(call)
    return new Response(result.body === undefined ? null : JSON.stringify(result.body), { status: result.status ?? 200 })
  }
  return { fetchLike, calls }
}

/** Adaptador ligado ao `fetch` falso; `/auth` sempre devolve uma chave nova e numerada. */
function provider(handler: Parameters<typeof fakeFetch>[0], clock = { now: 0 }) {
  let keys = 0
  const { fetchLike, calls } = fakeFetch((call) =>
    call.path === '/auth' ? { body: { apiKey: `chave-${++keys}` } } : handler(call),
  )
  const instance = new PluggyProvider({
    baseUrl: 'https://api.pluggy.test',
    fetch: fetchLike,
    getCredentials: async () => VALID,
    now: () => clock.now,
    sleep: async () => {},
  })
  return { instance, calls, clock }
}

describe('adaptador da Pluggy', () => {
  it('gera a API Key uma vez e a reutiliza nas chamadas seguintes', async () => {
    const { instance, calls } = provider(() => ({ body: { results: [], totalPages: 1 } }))

    await instance.listCategories()
    await instance.listAccounts('item')
    await instance.listBills('conta')

    assert.equal(calls.filter((call) => call.path === '/auth').length, 1)
    assert.deepEqual(calls[0]?.body, { clientId: VALID.clientId, clientSecret: VALID.clientSecret })
    assert.ok(calls.filter((call) => call.path !== '/auth').every((call) => call.apiKey === 'chave-1'))
  })

  it('renova a API Key perto da expiração de 2 horas', async () => {
    const { instance, calls, clock } = provider(() => ({ body: { results: [], totalPages: 1 } }))

    await instance.listCategories()
    clock.now = 110 * 60 * 1000
    await instance.listCategories()
    assert.equal(calls.filter((call) => call.path === '/auth').length, 1)

    clock.now = 116 * 60 * 1000
    await instance.listCategories()
    assert.equal(calls.filter((call) => call.path === '/auth').length, 2)
    assert.equal(calls.at(-1)?.apiKey, 'chave-2')
  })

  it('chave recusada no meio do caminho é renovada uma vez', async () => {
    let rejected = false
    const { instance, calls } = provider((call) => {
      if (!rejected && call.apiKey === 'chave-1') {
        rejected = true
        return { status: 401, body: {} }
      }
      return { body: { results: [], totalPages: 1 } }
    })

    await instance.listCategories()
    assert.deepEqual(calls.map((call) => [call.path, call.apiKey]), [
      ['/auth', null],
      ['/categories', 'chave-1'],
      ['/auth', null],
      ['/categories', 'chave-2'],
    ])
  })

  it('percorre a paginação por página até a última', async () => {
    const { instance, calls } = provider((call) => ({
      body: {
        results: [{ id: `acc-${call.query.page}`, itemId: 'item', type: 'BANK', name: 'Conta', balance: 1 }],
        page: Number(call.query.page),
        totalPages: 3,
      },
    }))

    const accounts = await instance.listAccounts('item')
    assert.deepEqual(accounts.map((account) => account.id), ['acc-1', 'acc-2', 'acc-3'])
    assert.deepEqual(calls.filter((c) => c.path === '/accounts').map((c) => c.query), [
      { itemId: 'item', pageSize: '500', page: '1' },
      { itemId: 'item', pageSize: '500', page: '2' },
      { itemId: 'item', pageSize: '500', page: '3' },
    ])
  })

  it('segue o cursor de /v2/transactions até `next` vir nulo', async () => {
    const pages: Record<string, { ids: string[]; next: string | null }> = {
      inicio: { ids: ['t1', 't2'], next: '?accountId=conta&after=cursor%3D1' },
      'cursor=1': { ids: ['t3'], next: '?accountId=conta&after=cursor%3D2' },
      'cursor=2': { ids: ['t4'], next: null },
    }
    const { instance, calls } = provider((call) => {
      const page = pages[call.query.after ?? 'inicio']!
      return {
        body: {
          results: page.ids.map((id) => ({ id, amount: -10, date: '2026-10-01T00:00:00.000Z', type: 'DEBIT', status: 'POSTED' })),
          next: page.next,
        },
      }
    })

    const ids: string[] = []
    for await (const page of instance.listTransactions(bankAccount({ id: 'conta' }), { dateFrom: '2026-07-01' })) {
      ids.push(...page.map((item) => item.id))
    }

    assert.deepEqual(ids, ['t1', 't2', 't3', 't4'])
    const requests = calls.filter((call) => call.path === '/v2/transactions')
    assert.deepEqual(requests[0]?.query, { accountId: 'conta', dateFrom: '2026-07-01' })
    assert.deepEqual(requests.map((call) => call.query.after), [undefined, 'cursor=1', 'cursor=2'])
  })

  it('interrompe se a Pluggy repetir o cursor', async () => {
    const { instance } = provider(() => ({ body: { results: [], next: '?accountId=conta&after=igual' } }))
    await assert.rejects(async () => {
      for await (const _ of instance.listTransactions(bankAccount({ id: 'conta' }), { dateFrom: '2026-07-01' })) void _
    }, /repetiu o cursor/)
  })

  it('tenta de novo em erro temporário e traduz a falha definitiva', async () => {
    let attempts = 0
    const flaky = provider(() => (++attempts < 3 ? { status: 503, body: {} } : { body: { results: [], totalPages: 1 } }))
    await flaky.instance.listCategories()
    assert.equal(attempts, 3)

    const down = provider(() => ({ status: 503, body: {} }))
    await assert.rejects(down.instance.listCategories(), (error) => error instanceof ProviderError && error.kind === 'unavailable')

    const refused = provider(() => ({ status: 400, body: { message: 'MeuPluggy item cant be updated', code: 400 } }))
    await assert.rejects(
      refused.instance.getItem('x'),
      (error) => error instanceof ProviderError && error.kind === 'unexpected' && error.message.includes('MeuPluggy item cant be updated'),
    )

    const missing = provider(() => ({ status: 404, body: {} }))
    await assert.rejects(missing.instance.getItem('x'), (error) => error instanceof ProviderError && error.kind === 'not_found')
  })

  it('credenciais recusadas em /auth viram erro de credenciais', async () => {
    const { fetchLike } = fakeFetch(() => ({ status: 401, body: { message: 'Unauthorized' } }))
    const instance = new PluggyProvider({ baseUrl: 'https://api.pluggy.test', fetch: fetchLike, getCredentials: async () => VALID })
    await assert.rejects(
      instance.verifyCredentials(VALID),
      (error) => error instanceof ProviderError && error.kind === 'invalid_credentials',
    )
  })

  it('sem credenciais configuradas, nem chega a chamar a rede', async () => {
    const { fetchLike, calls } = fakeFetch(() => ({ body: {} }))
    const instance = new PluggyProvider({ baseUrl: 'https://api.pluggy.test', fetch: fetchLike, getCredentials: async () => null })
    await assert.rejects(instance.listCategories(), (error) => error instanceof ProviderError && error.kind === 'missing_credentials')
    assert.equal(calls.length, 0)
  })

  it('pede o Connect Token com o itemId quando é uma atualização', async () => {
    const { instance, calls } = provider(() => ({ body: { accessToken: 'token-do-widget' } }))
    assert.equal(await instance.createConnectToken('item-1'), 'token-do-widget')
    assert.deepEqual(calls.at(-1)?.body, { itemId: 'item-1' })
  })
})

describe('normalização da Pluggy', () => {
  it('converte valores decimais em centavos sem erro de ponto flutuante', () => {
    const debit = normalizeTransaction({ id: 't', amount: -212.45, date: '2026-10-01T00:00:00.000Z', type: 'DEBIT' }, bankAccount())
    assert.equal(debit.amountCents, 21245)
    assert.equal(normalizeTransaction({ id: 't', amount: 0.07, date: '2026-10-01', type: 'CREDIT' }, bankAccount()).amountCents, 7)
    assert.equal(normalizeTransaction({ id: 't', amount: 1.005, date: '2026-10-01', type: 'CREDIT' }, bankAccount()).amountCents, 100)
  })

  it('sem `type`, deduz o sentido pelo sinal conforme o tipo de conta', () => {
    const base = { id: 't', date: '2026-10-01' }
    assert.equal(normalizeTransaction({ ...base, amount: -50 }, bankAccount()).type, 'DEBIT')
    assert.equal(normalizeTransaction({ ...base, amount: 50 }, bankAccount()).type, 'CREDIT')
    // Em cartão, positivo é compra e negativo é pagamento ou estorno.
    assert.equal(normalizeTransaction({ ...base, amount: 50 }, cardAccount()).type, 'DEBIT')
    assert.equal(normalizeTransaction({ ...base, amount: -50 }, cardAccount()).type, 'CREDIT')
  })

  it('lê fatura, previsão de fatura, parcelas e a outra ponta do pagamento', () => {
    const purchase = normalizeTransaction(
      {
        id: 't',
        amount: 99.9,
        date: '2026-10-01T15:00:00.000Z',
        type: 'DEBIT',
        status: 'PENDING',
        categoryId: '10000000',
        merchant: { businessName: 'Mercado Bom Preço LTDA' },
        creditCardMetadata: { billId: 'fatura-1', billForecastDate: '2026-11', installmentNumber: 2, totalInstallments: 6 },
      },
      cardAccount(),
    )
    assert.deepEqual(
      {
        status: purchase.status,
        billId: purchase.billId,
        billForecastMonth: purchase.billForecastMonth,
        installmentNumber: purchase.installmentNumber,
        totalInstallments: purchase.totalInstallments,
        merchantName: purchase.merchantName,
      },
      {
        status: 'PENDING',
        billId: 'fatura-1',
        billForecastMonth: '2026-11',
        installmentNumber: 2,
        totalInstallments: 6,
        merchantName: 'Mercado Bom Preço LTDA',
      },
    )

    const pix = normalizeTransaction(
      {
        id: 't',
        amount: 100,
        date: '2026-10-01',
        type: 'CREDIT',
        paymentData: {
          payer: { documentNumber: { type: 'CPF', value: '123.456.789-01' } },
          receiver: { documentNumber: { type: 'CPF', value: '987.654.321-00' } },
        },
      },
      bankAccount(),
    )
    assert.equal(pix.counterpartyDocument, '12345678901')
    assert.equal(normalizeTransaction({ id: 't', amount: 1, date: '2026-10-01', creditCardMetadata: { billForecastDate: 'x' } }, cardAccount()).billForecastMonth, null)
  })

  it('normaliza contas e faturas', () => {
    const card = normalizeAccount({
      id: 'c',
      itemId: 'i',
      type: 'CREDIT',
      subtype: 'CREDIT_CARD',
      name: 'Cartão',
      marketingName: 'Ultravioleta',
      balance: 1234.56,
      taxNumber: '123.456.789-01',
      creditData: { creditLimit: 5000, brand: 'VISA' },
    })
    assert.deepEqual(
      { name: card.name, balanceCents: card.balanceCents, ownerDocument: card.ownerDocument, creditLimitCents: card.creditLimitCents, brand: card.brand },
      { name: 'Ultravioleta', balanceCents: 123456, ownerDocument: '12345678901', creditLimitCents: 500000, brand: 'VISA' },
    )

    const bill = normalizeBill({ id: 'b', dueDate: '2026-11-10T00:00:00', billClosingDate: '2026-11-03T00:00:00', totalAmount: 1500.1 }, 'c')
    assert.deepEqual(bill, { id: 'b', accountId: 'c', dueDate: '2026-11-10', closingDate: '2026-11-03', totalCents: 150010, currencyCode: 'BRL' })
  })
})

describe('estado das conexões', () => {
  const health = (status: string, executionStatus: string | null = null, statusDetail: unknown = null) =>
    connectionHealth({ status, executionStatus, statusDetail })

  it('distingue em dia, atualizando, MFA, acesso recusado e desatualizada', () => {
    assert.deepEqual(health('UPDATED', 'SUCCESS'), { level: 'ok', action: 'none', title: 'Em dia', detail: null })
    assert.equal(health('UPDATING', 'TRANSACTIONS_IN_PROGRESS').level, 'updating')
    assert.equal(health('WAITING_USER_INPUT').action, 'mfa')
    assert.equal(health('LOGIN_ERROR', 'INVALID_CREDENTIALS').action, 'reconnect')
    assert.equal(health('OUTDATED', 'USER_AUTHORIZATION_REVOKED').action, 'reconnect')
    assert.deepEqual(
      (({ level, action }) => ({ level, action }))(health('OUTDATED', 'SITE_NOT_AVAILABLE')),
      { level: 'error', action: 'retry' },
    )
    assert.match(health('OUTDATED', 'ACCOUNT_LOCKED').detail ?? '', /bloqueada/)
  })

  it('sincronização parcial diz quais produtos faltaram', () => {
    const partial = health('UPDATED', 'PARTIAL_SUCCESS', {
      accounts: { isUpdated: true },
      creditCards: { isUpdated: false },
      transactions: { isUpdated: false },
    })
    assert.equal(partial.level, 'attention')
    assert.match(partial.detail ?? '', /cartões, transações/)
  })
})

describe('MeuPluggy', () => {
  it('é encontrado pelo nome em GET /connectors', async () => {
    const { instance, calls } = provider(() => ({
      body: {
        results: [
          { id: 601, name: 'Itaú', oauth: true },
          { id: 200, name: 'MeuPluggy', oauth: true, credentials: [] },
        ],
        totalPages: 1,
      },
    }))
    assert.deepEqual(await instance.findOwnDataConnector(), { id: 200, name: 'MeuPluggy' })
    assert.equal(calls.at(-1)?.path, '/connectors')
    assert.equal(calls.at(-1)?.query.name, 'MeuPluggy')
  })

  it('devolve nulo quando não está habilitado na Application', async () => {
    const { instance } = provider(() => ({ body: { results: [{ id: 601, name: 'Itaú' }], totalPages: 1 } }))
    assert.equal(await instance.findOwnDataConnector(), null)
  })

  it('não pede nova coleta de um item do MeuPluggy, que a Pluggy recusa', async () => {
    const item = (name: string) => ({ id: 'item-1', connector: { name }, status: 'UPDATED', executionStatus: 'SUCCESS' })
    const own = provider(() => ({ body: item('MeuPluggy') }))
    assert.equal(await own.instance.refreshItem('item-1'), null)
    assert.equal(own.calls.some((call) => call.method === 'PATCH'), false)

    const bank = provider(() => ({ body: item('Itaú') }))
    assert.equal((await bank.instance.refreshItem('item-1'))?.status, 'UPDATED')
    assert.equal(bank.calls.at(-1)?.method, 'PATCH')
  })
})
