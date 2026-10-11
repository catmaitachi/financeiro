/**
 * Simulador local da API da Pluggy, só para desenvolvimento.
 *
 * Sobe em http://127.0.0.1:8899 e responde às mesmas rotas que a aplicação
 * usa, com dados fictícios e determinísticos (os mesmos ids a cada execução no
 * mesmo mês). Nada aqui fala com a Pluggy de verdade.
 *
 * Uso: `npm run dev:mock`, depois cadastre em /setup as credenciais abaixo e
 * rode `npm run mock:seed` para conectar as instituições fictícias.
 */
import { createHash } from 'node:crypto'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { addMonths, type Month } from '../shared/months.ts'
import { MOCK_CLIENT_ID, MOCK_CLIENT_SECRET, MOCK_ITEMS } from './mock-fixtures.ts'

const PORT = 8899
/** Troque para `false` para simular uma Application sem o MeuPluggy na lista de conectores. */
const MEUPLUGGY_ENABLED = true
const PAGE_SIZE = 40
const OWNER_CPF = '529.982.247-25'
const HISTORY_MONTHS = 8

type Raw = Record<string, unknown>

/** UUID estável derivado de um texto, para que cada lançamento mantenha o id. */
function stableId(key: string): string {
  const hex = createHash('sha1').update(key).digest('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`
}

/** Gerador pseudoaleatório com semente (mulberry32): mesmos dados a cada execução. */
function random(seed: string) {
  let state = parseInt(createHash('sha1').update(seed).digest('hex').slice(0, 8), 16)
  return () => {
    state = (state + 0x6d2b79f5) | 0
    let t = Math.imul(state ^ (state >>> 15), 1 | state)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const thisMonth: Month = today.slice(0, 7)
const day = (month: Month, d: number) => `${month}-${String(d).padStart(2, '0')}`

const CATEGORIES: Raw[] = [
  ['01000000', 'Income', 'Renda'],
  ['01010000', 'Salary', 'Salário', '01000000'],
  ['01050000', 'Non-recurring income', 'Renda não recorrente', '01000000'],
  ['04000000', 'Same person transfer', 'Transferência mesma titularidade'],
  ['04020000', 'Same person transfer - PIX', 'Transferência mesma titularidade - PIX', '04000000'],
  ['05000000', 'Transfers', 'Transferências'],
  ['05070000', 'Transfer - PIX', 'Transferência - PIX', '05000000'],
  ['05100000', 'Credit card payment', 'Pagamento de cartão de crédito', '05000000'],
  ['07000000', 'Services', 'Serviços'],
  ['07010000', 'Telecommunications', 'Telecomunicações', '07000000'],
  ['07030000', 'Wellness and fitness', 'Saúde e bem-estar', '07000000'],
  ['08000000', 'Shopping', 'Compras'],
  ['08010000', 'Online shopping', 'Compras online', '08000000'],
  ['08060000', 'Bookstore', 'Livraria', '08000000'],
  ['09000000', 'Digital services', 'Serviços digitais'],
  ['09020000', 'Video streaming', 'Streaming de vídeo', '09000000'],
  ['09030000', 'Music streaming', 'Streaming de música', '09000000'],
  ['10000000', 'Groceries', 'Mercado'],
  ['11000000', 'Food and drinks', 'Alimentação'],
  ['11010000', 'Eating out', 'Restaurantes', '11000000'],
  ['11020000', 'Food delivery', 'Delivery', '11000000'],
  ['12000000', 'Travel', 'Viagem'],
  ['12020000', 'Accommodation', 'Hospedagem', '12000000'],
  ['17000000', 'Housing', 'Moradia'],
  ['17010000', 'Rent', 'Aluguel', '17000000'],
  ['18000000', 'Healthcare', 'Saúde'],
  ['18020000', 'Pharmacy', 'Farmácia', '18000000'],
  ['19000000', 'Transportation', 'Transporte'],
  ['19010000', 'Taxi and ride-hailing', 'Táxi e apps de transporte', '19000000'],
  ['20000000', 'Automotive', 'Automotivo'],
  ['20010000', 'Gas stations', 'Postos de combustível', '20000000'],
  ['21000000', 'Utilities', 'Contas de consumo'],
  ['21020000', 'Electricity', 'Energia elétrica', '21000000'],
].map(([id, description, descriptionTranslated, parentId]) => ({
  id,
  description,
  descriptionTranslated,
  ...(parentId ? { parentId } : {}),
}))

const ACCOUNTS = {
  auroraChecking: stableId('aurora-checking'),
  auroraSavings: stableId('aurora-savings'),
  auroraCard: stableId('aurora-card'),
  solarCard: stableId('solar-card'),
  litoralChecking: stableId('litoral-checking'),
}

const accounts: Raw[] = [
  {
    id: ACCOUNTS.auroraChecking,
    itemId: MOCK_ITEMS.aurora,
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta Corrente',
    number: '0001/48213-7',
    balance: 6842.37,
    currencyCode: 'BRL',
    taxNumber: OWNER_CPF,
  },
  {
    id: ACCOUNTS.auroraSavings,
    itemId: MOCK_ITEMS.aurora,
    type: 'BANK',
    subtype: 'SAVINGS_ACCOUNT',
    name: 'Reserva',
    number: '0001/48213-8',
    balance: 18350.9,
    currencyCode: 'BRL',
    taxNumber: OWNER_CPF,
  },
  {
    id: ACCOUNTS.auroraCard,
    itemId: MOCK_ITEMS.aurora,
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    name: 'Aurora Platinum',
    number: '7731',
    balance: 2310.44,
    currencyCode: 'BRL',
    taxNumber: OWNER_CPF,
    creditData: { brand: 'MASTERCARD', creditLimit: 14000 },
  },
  {
    id: ACCOUNTS.solarCard,
    itemId: MOCK_ITEMS.solar,
    type: 'CREDIT',
    subtype: 'CREDIT_CARD',
    name: 'Solar Gold',
    number: '0425',
    balance: 640.1,
    currencyCode: 'BRL',
    taxNumber: OWNER_CPF,
    creditData: { brand: 'VISA', creditLimit: 6000 },
  },
  {
    id: ACCOUNTS.litoralChecking,
    itemId: MOCK_ITEMS.litoral,
    type: 'BANK',
    subtype: 'CHECKING_ACCOUNT',
    name: 'Conta PJ',
    number: '0412/90377-1',
    balance: 3120.0,
    currencyCode: 'BRL',
    taxNumber: OWNER_CPF,
  },
]

const items = new Map<string, Raw>([
  [
    MOCK_ITEMS.aurora,
    {
      id: MOCK_ITEMS.aurora,
      connector: { name: 'Banco Aurora', primaryColor: 'E8743B', imageUrl: null },
      status: 'UPDATED',
      executionStatus: 'SUCCESS',
      lastUpdatedAt: new Date().toISOString(),
      error: null,
      statusDetail: null,
    },
  ],
  [
    MOCK_ITEMS.solar,
    {
      id: MOCK_ITEMS.solar,
      connector: { name: 'Cartões Solar', primaryColor: 'F2B84B', imageUrl: null },
      status: 'UPDATED',
      executionStatus: 'PARTIAL_SUCCESS',
      lastUpdatedAt: new Date().toISOString(),
      error: null,
      statusDetail: { accounts: { isUpdated: true }, creditCards: { isUpdated: true }, transactions: { isUpdated: false } },
    },
  ],
  [
    MOCK_ITEMS.litoral,
    {
      id: MOCK_ITEMS.litoral,
      connector: { name: 'Banco Litoral', primaryColor: '4E8FA8', imageUrl: null },
      status: 'WAITING_USER_INPUT',
      executionStatus: 'WAITING_USER_INPUT',
      lastUpdatedAt: new Date(Date.now() - 9 * 86_400_000).toISOString(),
      error: null,
      statusDetail: null,
    },
  ],
])

// --- Lançamentos -----------------------------------------------------------

const transactions: Raw[] = []
const bills: Raw[] = []

interface Entry {
  account: string
  date: string
  description: string
  amount: number
  type: 'DEBIT' | 'CREDIT'
  category?: string
  status?: 'PENDING'
  currency?: string
  counterparty?: string
  merchant?: string
  card?: Raw
}

function add(entry: Entry) {
  const signed =
    entry.card !== undefined
      ? entry.type === 'DEBIT'
        ? entry.amount
        : -entry.amount
      : entry.type === 'DEBIT'
        ? -entry.amount
        : entry.amount
  const document = entry.counterparty ? { documentNumber: { type: 'CPF', value: entry.counterparty } } : null
  transactions.push({
    id: stableId(`${entry.account}|${entry.date}|${entry.description}|${entry.amount}|${JSON.stringify(entry.card ?? {})}`),
    accountId: entry.account,
    date: `${entry.date}T00:00:00.000Z`,
    description: entry.description,
    amount: signed,
    currencyCode: entry.currency ?? 'BRL',
    type: entry.type,
    status: entry.status ?? 'POSTED',
    categoryId: entry.category ?? null,
    merchant: entry.merchant ? { name: entry.merchant } : null,
    paymentData: document ? (entry.type === 'CREDIT' ? { payer: document } : { receiver: document }) : null,
    creditCardMetadata: entry.card ?? null,
  })
}

const BANK_SPENDING: [string, string, number, number][] = [
  ['Mercado Vila Nova', '10000000', 180, 420],
  ['Padaria Trigo e Mel', '11010000', 14, 48],
  ['Farmácia Bem Viver', '18020000', 22, 130],
  ['Posto Avenida', '20010000', 150, 260],
  ['Feira da Praça', '10000000', 60, 140],
]

const CARD_SPENDING: [string, string, number, number][] = [
  ['Restaurante Brasa Viva', '11010000', 62, 190],
  ['Entrega Rápida Delivery', '11020000', 34, 88],
  ['Corridas Urbanas', '19010000', 12, 46],
  ['Empório do Bairro', '10000000', 90, 310],
  ['Livraria Ponto e Vírgula', '08060000', 45, 160],
  ['Loja Casa Clara', '08010000', 70, 380],
  ['Cine Estação', '11010000', 38, 72],
]

const money = (value: number) => Math.round(value * 100) / 100

for (let back = HISTORY_MONTHS - 1; back >= 0; back--) {
  const month = addMonths(thisMonth, -back)
  const rng = random(`mes-${month}`)
  const pick = (min: number, max: number) => money(min + rng() * (max - min))
  const isCurrent = back === 0
  const visible = (date: string) => date <= today

  // Conta corrente: salário, aluguel, contas fixas e gastos do dia a dia.
  const bank: Entry[] = [
    { account: ACCOUNTS.auroraChecking, date: day(month, 5), description: 'Salário Estúdio Marés', amount: 8450, type: 'CREDIT', category: '01010000' },
    { account: ACCOUNTS.auroraChecking, date: day(month, 6), description: 'PIX enviado - Imobiliária Jardim', amount: 2300, type: 'DEBIT', category: '17010000', counterparty: '111.444.777-35' },
    { account: ACCOUNTS.auroraChecking, date: day(month, 8), description: 'Energia Luz do Vale', amount: pick(140, 230), type: 'DEBIT', category: '21020000' },
    { account: ACCOUNTS.auroraChecking, date: day(month, 9), description: 'Fibra Conecta Internet', amount: 119.9, type: 'DEBIT', category: '07010000' },
    { account: ACCOUNTS.auroraChecking, date: day(month, 12), description: 'Academia Corpo Ativo', amount: 129, type: 'DEBIT', category: '07030000' },
    // Transferência para a reserva, reconhecida pela categoria nas duas pontas.
    { account: ACCOUNTS.auroraChecking, date: day(month, 7), description: 'Transferência para Reserva', amount: 1000, type: 'DEBIT', category: '04020000', counterparty: OWNER_CPF },
    { account: ACCOUNTS.auroraSavings, date: day(month, 7), description: 'Transferência recebida da Conta Corrente', amount: 1000, type: 'CREDIT', category: '04020000', counterparty: OWNER_CPF },
    // Resgate da reserva sem categoria própria: só o pareamento entre contas denuncia.
    { account: ACCOUNTS.auroraSavings, date: day(month, 18), description: 'PIX enviado', amount: 350, type: 'DEBIT', category: '05070000' },
    { account: ACCOUNTS.auroraChecking, date: day(month, 18), description: 'PIX recebido', amount: 350, type: 'CREDIT', category: '05070000' },
    // Recebimentos de clientes: alimentam a conciliação com as previsões.
    { account: ACCOUNTS.auroraChecking, date: day(month, 15), description: 'PIX recebido - Ateliê Girassol', amount: 1200, type: 'CREDIT', category: '01050000', counterparty: '390.533.447-05' },
  ]
  for (let i = 0; i < 9; i++) {
    const [description, category, min, max] = BANK_SPENDING[Math.floor(rng() * BANK_SPENDING.length)]!
    bank.push({ account: ACCOUNTS.auroraChecking, date: day(month, 1 + Math.floor(rng() * 27)), description, amount: pick(min, max), type: 'DEBIT', category, merchant: description })
  }
  bank.filter((entry) => visible(entry.date)).forEach(add)

  // Conta PJ: parada no mês passado, porque a conexão aguarda um código de confirmação.
  if (!isCurrent) {
    add({ account: ACCOUNTS.litoralChecking, date: day(month, 20), description: 'PIX recebido - Oficina Horizonte', amount: 450, type: 'CREDIT', category: '01050000', counterparty: '288.119.650-40' })
    add({ account: ACCOUNTS.litoralChecking, date: day(month, 22), description: 'Tarifa de manutenção', amount: 29.9, type: 'DEBIT' })
  }

  // Cartão Aurora: fecha dia 3, vence dia 10. Compras de 4/(M-1) a 3/M caem na fatura de M.
  const previous = addMonths(month, -1)
  const closing = day(month, 3)
  const closed = closing < today
  const billId = stableId(`aurora-bill-${month}`)
  let billTotal = 0
  const purchases: Entry[] = []
  for (let i = 0; i < 13; i++) {
    const [description, category, min, max] = CARD_SPENDING[Math.floor(rng() * CARD_SPENDING.length)]!
    const offset = Math.floor(rng() * 30)
    const date = offset < 27 ? day(previous, 4 + offset) : day(month, 1 + (offset - 27))
    purchases.push({ account: ACCOUNTS.auroraCard, date, description, amount: pick(min, max), type: 'DEBIT', category, merchant: description })
  }
  purchases.push(
    { account: ACCOUNTS.auroraCard, date: day(previous, 11), description: 'Assinatura Tela Mais', amount: 39.9, type: 'DEBIT', category: '09020000' },
    { account: ACCOUNTS.auroraCard, date: day(previous, 14), description: 'Assinatura Som Livre', amount: 21.9, type: 'DEBIT', category: '09030000' },
  )
  for (const purchase of purchases.filter((entry) => visible(entry.date))) {
    billTotal += purchase.amount
    add({
      ...purchase,
      // Fatura fechada vem com `billId`; a aberta, só com a previsão e como pendente.
      ...(closed ? { card: { billId } } : { status: 'PENDING', card: { billForecastDate: month } }),
    })
  }
  if (closed) {
    bills.push({
      id: billId,
      accountId: ACCOUNTS.auroraCard,
      dueDate: `${day(month, 10)}T00:00:00`,
      billClosingDate: `${closing}T00:00:00`,
      totalAmount: money(billTotal),
      totalAmountCurrencyCode: 'BRL',
      minimumPaymentAmount: money(billTotal * 0.15),
      allowsInstallments: true,
      financeCharges: [],
      payments: [],
    })
    // Pagamento da fatura: sai da conta e entra no cartão. Nenhuma das pontas é gasto novo.
    if (visible(day(month, 10))) {
      add({ account: ACCOUNTS.auroraChecking, date: day(month, 10), description: 'Pagamento de fatura Aurora Platinum', amount: money(billTotal), type: 'DEBIT', category: '05100000' })
      add({ account: ACCOUNTS.auroraCard, date: day(month, 10), description: 'Pagamento recebido', amount: money(billTotal), type: 'CREDIT', category: '05100000', card: { billForecastDate: addMonths(month, 1) } })
    }
  }

  // Cartão Solar: conector sem faturas. A maioria traz a previsão; alguns lançamentos, nada.
  for (let i = 0; i < 4; i++) {
    const [description, category, min, max] = CARD_SPENDING[Math.floor(rng() * CARD_SPENDING.length)]!
    const date = day(previous, 6 + Math.floor(rng() * 20))
    if (visible(date)) {
      add({ account: ACCOUNTS.solarCard, date, description, amount: pick(min, max), type: 'DEBIT', category, merchant: description, card: { billForecastDate: month } })
    }
  }
}

// Casos pontuais que a interface precisa saber mostrar.
const lastMonth = addMonths(thisMonth, -1)

// Compra parcelada: parcelas futuras já aparecem, cada uma na sua fatura.
for (let installment = 1; installment <= 6; installment++) {
  const month = addMonths(lastMonth, installment - 1)
  const closed = day(month, 3) < today
  add({
    account: ACCOUNTS.auroraCard,
    date: day(addMonths(lastMonth, -1), 22),
    description: 'Oficina de Bicicletas Pedal',
    amount: 189.9,
    type: 'DEBIT',
    category: '08010000',
    ...(closed ? {} : { status: 'PENDING' as const }),
    card: {
      ...(closed ? { billId: stableId(`aurora-bill-${month}`) } : { billForecastDate: month }),
      installmentNumber: installment,
      totalInstallments: 6,
    },
  })
}
// Estorno no cartão.
add({ account: ACCOUNTS.auroraCard, date: day(lastMonth, 19), description: 'Estorno Loja Casa Clara', amount: 84.5, type: 'CREDIT', category: '08010000', card: { billId: stableId(`aurora-bill-${thisMonth}`) } })
// Compras do Solar sem fatura nem previsão: "Fatura não identificada".
add({ account: ACCOUNTS.solarCard, date: day(lastMonth, 27), description: 'Pousada Mirante da Serra', amount: 412, type: 'DEBIT', category: '12020000', card: {} })
add({ account: ACCOUNTS.solarCard, date: day(thisMonth, 2), description: 'Corridas Urbanas', amount: 31.4, type: 'DEBIT', category: '19010000', card: {} })
// Outra moeda: visível, mas fora dos totais em reais.
add({ account: ACCOUNTS.auroraCard, date: day(lastMonth, 21), description: 'Cloud Notes Pro', amount: 12, type: 'DEBIT', category: '09000000', currency: 'USD', card: { billId: stableId(`aurora-bill-${thisMonth}`) } })
// Pendentes em conta: aparecem à parte.
add({ account: ACCOUNTS.auroraChecking, date: today, description: 'PIX agendado - Curso de Cerâmica', amount: 180, type: 'DEBIT', status: 'PENDING', category: '05070000', counterparty: '746.971.314-01' })
add({ account: ACCOUNTS.auroraChecking, date: today, description: 'TED em processamento - Editora Cais', amount: 640, type: 'CREDIT', status: 'PENDING', category: '01050000' })
// Dois recebimentos de mesmo valor no mês passado: ambiguidade na conciliação.
add({ account: ACCOUNTS.auroraChecking, date: day(lastMonth, 24), description: 'PIX recebido - Oficina Horizonte', amount: 450, type: 'CREDIT', category: '01050000', counterparty: '288.119.650-40' })
// Recebimento adiantado do mês seguinte, para o caso "fora do mês".
if (day(thisMonth, 3) <= today) {
  add({ account: ACCOUNTS.auroraChecking, date: day(thisMonth, 3), description: 'PIX recebido - Editora Cais', amount: 780, type: 'CREDIT', category: '01050000', counterparty: '153.509.460-56' })
}

// --- Rotas -----------------------------------------------------------------

const app = new Hono()
let issuedKeys = 0

app.post('/auth', async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Raw
  if (body.clientId !== MOCK_CLIENT_ID || body.clientSecret !== MOCK_CLIENT_SECRET) {
    return c.json({ code: 401, message: 'Client keys are invalid' }, 401)
  }
  return c.json({ apiKey: `mock-api-key-${++issuedKeys}` })
})

app.use(async (c, next) => {
  if (!c.req.header('x-api-key')?.startsWith('mock-api-key-')) {
    return c.json({ code: 401, message: 'Missing or invalid API key' }, 401)
  }
  await next()
})

app.post('/connect_token', (c) => c.json({ accessToken: 'mock-connect-token' }))

app.get('/items/:id', (c) => {
  const item = items.get(c.req.param('id'))
  return item ? c.json(item) : c.json({ code: 404, message: 'item not found' }, 404)
})

app.patch('/items/:id', (c) => {
  const item = items.get(c.req.param('id'))
  if (!item) return c.json({ code: 404, message: 'item not found' }, 404)
  // Simula a coleta: fica "atualizando" por alguns segundos e volta ao estado anterior.
  const settled = { status: item.status, executionStatus: item.executionStatus }
  Object.assign(item, { status: 'UPDATING', executionStatus: 'TRANSACTIONS_IN_PROGRESS' })
  setTimeout(() => Object.assign(item, settled, { lastUpdatedAt: new Date().toISOString() }), 6000)
  return c.json(item)
})

app.delete('/items/:id', (c) => {
  items.delete(c.req.param('id'))
  return c.json({ count: 1 })
})

const paged = (results: Raw[]) => ({ total: results.length, totalPages: 1, page: 1, results })

app.get('/accounts', (c) => c.json(paged(accounts.filter((account) => account.itemId === c.req.query('itemId')))))
app.get('/bills', (c) => c.json(paged(bills.filter((bill) => bill.accountId === c.req.query('accountId')))))
app.get('/categories', (c) => c.json(paged(CATEGORIES)))
app.get('/connectors', (c) =>
  c.json(paged(MEUPLUGGY_ENABLED ? [{ id: 200, name: 'MeuPluggy', type: 'PERSONAL_BANK', country: 'BR', oauth: true, credentials: [] }] : [])),
)

app.get('/v2/transactions', (c) => {
  const accountId = c.req.query('accountId')
  const dateFrom = c.req.query('dateFrom') ?? '0000-00-00'
  const offset = Number(c.req.query('after') ?? 0)
  const matching = transactions
    .filter((tx) => tx.accountId === accountId && String(tx.date).slice(0, 10) >= dateFrom)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(a.id).localeCompare(String(b.id)))
  // Como na Pluggy, `next` já é a query string completa da página seguinte.
  const next =
    offset + PAGE_SIZE < matching.length
      ? `?accountId=${accountId}&dateFrom=${dateFrom}&after=${offset + PAGE_SIZE}`
      : null
  return c.json({ results: matching.slice(offset, offset + PAGE_SIZE), next })
})

serve({ fetch: app.fetch, hostname: '127.0.0.1', port: PORT }, () => {
  console.log(`Simulador da Pluggy em http://127.0.0.1:${PORT} (${transactions.length} lançamentos fictícios)`)
})
