import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { bankAccount, CARD, cardAccount, CHECKING, OWNER_CPF, SAVINGS, seeded, tx } from './support.ts'

describe('consolidação mensal', () => {
  it('em conta, crédito confirmado é entrada e débito confirmado é saída', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-10-05T12:00:00.000Z', amountCents: 500000, type: 'CREDIT', categoryId: '01000000' }),
      tx({ postedAt: '2026-10-06T12:00:00.000Z', amountCents: 12050, categoryId: '10000000' }),
      tx({ postedAt: '2026-10-07T12:00:00.000Z', amountCents: 3000, categoryId: '11010000' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const { totals } = container.dashboard.build('2026-10')
    assert.equal(totals.incomeReceivedCents, 500000)
    assert.equal(totals.expenseCents, 15050)
    assert.equal(totals.balanceCents, 484950)
  })

  it('pendentes de conta aparecem à parte e ficam fora dos totais realizados', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-10-06T12:00:00.000Z', amountCents: 10000 }),
      tx({ postedAt: '2026-10-07T12:00:00.000Z', amountCents: 2500, status: 'PENDING' }),
      tx({ postedAt: '2026-10-07T12:00:00.000Z', amountCents: 40000, status: 'PENDING', type: 'CREDIT' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const dashboard = container.dashboard.build('2026-10')
    assert.equal(dashboard.totals.expenseCents, 10000)
    assert.equal(dashboard.totals.incomeReceivedCents, 0)
    assert.deepEqual(dashboard.pending, { count: 2, inCents: 40000, outCents: 2500 })
  })

  it('gasto de cartão cai no mês da fatura, não no mês da compra', async () => {
    const { provider, container } = seeded()
    provider.bills = [
      { id: 'fatura-nov', accountId: CARD, dueDate: '2026-11-10', closingDate: '2026-11-03', totalCents: 0, currencyCode: 'BRL' },
    ]
    provider.transactions = [
      // Comprado em outubro, fatura fechada com vencimento em novembro.
      tx({ accountId: CARD, postedAt: '2026-10-20T12:00:00.000Z', amountCents: 20000, billId: 'fatura-nov' }),
      // Comprado em outubro, fatura ainda aberta prevista para dezembro.
      tx({ accountId: CARD, postedAt: '2026-10-29T12:00:00.000Z', amountCents: 9000, status: 'PENDING', billForecastMonth: '2026-12' }),
      // Sem fatura nem previsão: não entra em nenhum mês.
      tx({ accountId: CARD, postedAt: '2026-10-30T12:00:00.000Z', amountCents: 7700 }),
    ]
    await container.sync.run({ trigger: 'manual' })

    assert.equal(container.dashboard.build('2026-10').totals.expenseCents, 0)

    const november = container.dashboard.build('2026-11')
    assert.equal(november.totals.expenseCents, 20000)
    assert.equal(november.byCard[0]?.dueDate, '2026-11-10')
    assert.equal(november.byCard[0]?.openCents, 0)

    const december = container.dashboard.build('2026-12')
    assert.equal(december.totals.expenseCents, 9000)
    assert.equal(december.byCard[0]?.openCents, 9000)

    assert.deepEqual(november.unidentifiedBill, { count: 1, cents: 7700 })
    assert.equal(container.ledger.listTransactions({ unidentified: true }).items[0]?.competenceSource, 'none')
  })

  it('estorno no cartão reduz o gasto da fatura', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ accountId: CARD, postedAt: '2026-10-10T12:00:00.000Z', amountCents: 30000, billForecastMonth: '2026-11' }),
      tx({ accountId: CARD, postedAt: '2026-10-12T12:00:00.000Z', amountCents: 5000, type: 'CREDIT', description: 'Estorno Loja', billForecastMonth: '2026-11' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const november = container.dashboard.build('2026-11')
    assert.equal(november.totals.expenseCents, 25000)
    assert.equal(november.totals.incomeReceivedCents, 0)
  })

  it('pagamento de fatura não é contado de novo como gasto', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ accountId: CARD, postedAt: '2026-09-15T12:00:00.000Z', amountCents: 80000, billForecastMonth: '2026-10', categoryId: '10000000' }),
      // Saída da conta para pagar a fatura, e a entrada correspondente no cartão.
      tx({ postedAt: '2026-10-10T12:00:00.000Z', amountCents: 80000, categoryId: '05100000', description: 'Pagamento de fatura' }),
      tx({ accountId: CARD, postedAt: '2026-10-10T12:00:00.000Z', amountCents: 80000, type: 'CREDIT', description: 'Pagamento recebido', billForecastMonth: '2026-11' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const october = container.dashboard.build('2026-10')
    assert.equal(october.totals.expenseCents, 80000)
    assert.equal(container.dashboard.build('2026-11').totals.expenseCents, 0)
    assert.deepEqual(
      container.ledger.listTransactions({}).items.map((item) => [item.kind, item.included]).sort(),
      [
        ['bill_payment', false],
        ['bill_payment', false],
        ['regular', true],
      ],
    )
  })

  it('transferência entre contas próprias não vira gasto nem receita', async () => {
    const { provider, container } = seeded()
    provider.accounts.push(bankAccount({ id: SAVINGS, name: 'Poupança', subtype: 'SAVINGS_ACCOUNT' }))
    provider.transactions = [
      // Reconhecida pela categoria do provedor.
      tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 100000, categoryId: '04020000' }),
      tx({ accountId: SAVINGS, postedAt: '2026-10-02T12:00:00.000Z', amountCents: 100000, type: 'CREDIT', categoryId: '04020000' }),
      // Reconhecida pelo documento da outra ponta.
      tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 20000, categoryId: '05070000', counterpartyDocument: OWNER_CPF }),
      // Reconhecida só pelo pareamento de valores entre contas.
      tx({ accountId: SAVINGS, postedAt: '2026-10-04T12:00:00.000Z', amountCents: 33300, categoryId: '05070000' }),
      tx({ postedAt: '2026-10-05T12:00:00.000Z', amountCents: 33300, type: 'CREDIT', categoryId: '05070000' }),
      // PIX para terceiro: gasto de verdade.
      tx({ postedAt: '2026-10-06T12:00:00.000Z', amountCents: 15000, categoryId: '05070000', counterpartyDocument: '98765432100' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const { totals, byAccount } = container.dashboard.build('2026-10')
    assert.equal(totals.expenseCents, 15000)
    assert.equal(totals.incomeReceivedCents, 0)
    assert.deepEqual(byAccount.map((slice) => [slice.accountId, slice.outCents]), [[CHECKING, 15000]])
  })

  it('correção local de inclusão e de categoria vale mais que a regra automática', async () => {
    const { provider, container } = seeded()
    const transfer = tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 50000, categoryId: '04020000' })
    const lunch = tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 4000, categoryId: '11010000' })
    provider.transactions = [transfer, lunch]
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.dashboard.build('2026-10').totals.expenseCents, 4000)

    container.ledger.setOverride(transfer.id, { includeInTotals: true })
    container.ledger.setOverride(lunch.id, { categoryId: '10000000' })
    let dashboard = container.dashboard.build('2026-10')
    assert.equal(dashboard.totals.expenseCents, 54000)
    assert.ok(dashboard.byCategory.some((slice) => slice.name === 'Mercado' && slice.cents === 4000))

    // As correções sobrevivem a novas sincronizações.
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.dashboard.build('2026-10').totals.expenseCents, 54000)

    container.ledger.setOverride(lunch.id, { includeInTotals: false })
    container.ledger.setOverride(transfer.id, { includeInTotals: null })
    dashboard = container.dashboard.build('2026-10')
    assert.equal(dashboard.totals.expenseCents, 0)
  })

  it('agrupa gastos pela categoria de primeiro nível', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 4000, categoryId: '11010000' }),
      tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 6000, categoryId: '11000000' }),
      tx({ postedAt: '2026-10-04T12:00:00.000Z', amountCents: 2500 }),
    ]
    await container.sync.run({ trigger: 'manual' })

    assert.deepEqual(container.dashboard.build('2026-10').byCategory, [
      { categoryId: '11000000', name: 'Alimentação', cents: 10000 },
      { categoryId: null, name: 'Sem categoria', cents: 2500 },
    ])
  })

  it('outras moedas ficam visíveis, mas fora dos totais em reais', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 10000 }),
      tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 5800, currencyCode: 'USD' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const dashboard = container.dashboard.build('2026-10')
    assert.equal(dashboard.totals.expenseCents, 10000)
    assert.deepEqual(dashboard.otherCurrencies, [{ currencyCode: 'USD', count: 1, inCents: 0, outCents: 5800 }])
  })

  it('compara com o mês anterior e soma as previsões em aberto', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-09-10T12:00:00.000Z', amountCents: 30000 }),
      tx({ postedAt: '2026-10-10T12:00:00.000Z', amountCents: 45000 }),
    ]
    await container.sync.run({ trigger: 'manual' })
    container.forecasts.create({ expression: '1.500,00*2', startMonth: '2026-10' })

    const dashboard = container.dashboard.build('2026-10')
    assert.equal(dashboard.previous.expenseCents, 30000)
    assert.equal(dashboard.totals.expenseCents, 45000)
    assert.equal(dashboard.totals.incomeForecastCents, 150000)
    // A faixa de histórico vai até o mês seguinte ao atual, para mostrar o que já está contratado.
    assert.equal(dashboard.history.length, 12)
    assert.deepEqual(dashboard.history.slice(-3), [
      { month: '2026-09', incomeCents: 0, expenseCents: 30000 },
      { month: '2026-10', incomeCents: 0, expenseCents: 45000 },
      { month: '2026-11', incomeCents: 0, expenseCents: 0 },
    ])
    // A faixa pode ser deslocada sem mudar a competência exibida.
    const shifted = container.dashboard.build('2026-10', '2026-06')
    assert.equal(shifted.history.at(-1)?.month, '2026-06')
    assert.equal(shifted.totals.expenseCents, 45000)
    assert.equal(shifted.previous.expenseCents, 30000)
  })

  it('pesquisa por texto sem acento e filtra por conta, sentido e categoria', async () => {
    const { provider, container } = seeded()
    provider.transactions = [
      tx({ postedAt: '2026-10-02T12:00:00.000Z', amountCents: 1800, description: 'Café São João', categoryId: '11010000' }),
      tx({ postedAt: '2026-10-03T12:00:00.000Z', amountCents: 250000, type: 'CREDIT', description: 'Salário', categoryId: '01000000' }),
      tx({ accountId: CARD, postedAt: '2026-10-04T12:00:00.000Z', amountCents: 9900, description: 'Mercado 100%', categoryId: '10000000', billForecastMonth: '2026-11' }),
    ]
    await container.sync.run({ trigger: 'manual' })
    const descriptions = (query: Parameters<typeof container.ledger.listTransactions>[0]) =>
      container.ledger.listTransactions(query).items.map((item) => item.description)

    assert.deepEqual(descriptions({ q: 'cafe sao' }), ['Café São João'])
    assert.deepEqual(descriptions({ q: '100%' }), ['Mercado 100%'])
    assert.deepEqual(descriptions({ accountId: CARD }), ['Mercado 100%'])
    assert.deepEqual(descriptions({ direction: 'in' }), ['Salário'])
    assert.deepEqual(descriptions({ categoryId: '11000000' }), ['Café São João'])
    assert.deepEqual(descriptions({ month: '2026-11' }), ['Mercado 100%'])
    assert.deepEqual(descriptions({ from: '2026-10-03', to: '2026-10-03' }), ['Salário'])

    const page = container.ledger.listTransactions({ pageSize: 2 })
    assert.equal(page.total, 3)
    assert.equal(page.items.length, 2)
    assert.deepEqual(page.totals, { inCents: 250000, outCents: 11700 })
  })
})

describe('fatura atual do cartão', () => {
  const BILL_OCT = { id: 'fatura-out', accountId: CARD, dueDate: '2026-10-14', closingDate: '2026-10-05', totalCents: 231890, currencyCode: 'BRL' }

  it('mostra a fatura fechada enquanto ela não venceu nem foi paga', async () => {
    const { provider, container } = seeded()
    provider.bills = [BILL_OCT]
    await container.sync.run({ trigger: 'manual' })

    const [bill] = container.dashboard.build('2026-10').bills
    assert.equal(bill?.state, 'closed')
    assert.equal(bill?.month, '2026-10')
    assert.equal(bill?.amountCents, 231890)
    assert.equal(bill?.dueDate, '2026-10-14')
    assert.equal(bill?.previousPaid, false)
  })

  it('depois de paga, mostra a fatura em aberto do mês seguinte', async () => {
    const { provider, container } = seeded()
    provider.bills = [BILL_OCT]
    provider.transactions = [
      tx({ accountId: CARD, postedAt: '2026-10-07T12:00:00.000Z', amountCents: 231890, type: 'CREDIT', categoryId: '05100000' }),
      tx({ accountId: CARD, postedAt: '2026-10-06T12:00:00.000Z', amountCents: 12000, status: 'PENDING', billForecastMonth: '2026-11' }),
      tx({ accountId: CARD, postedAt: '2026-10-07T12:00:00.000Z', amountCents: 3000, status: 'PENDING', billForecastMonth: '2026-11' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const [bill] = container.dashboard.build('2026-10').bills
    assert.equal(bill?.state, 'open')
    assert.equal(bill?.month, '2026-11')
    assert.equal(bill?.amountCents, 15000)
    assert.equal(bill?.previousPaid, true)
    assert.equal(bill?.dueDate, '2026-11-14')
    assert.equal(bill?.dueDateEstimated, true)
  })

  it('fatura vencida dá lugar à seguinte mesmo sem pagamento identificado', async () => {
    const { provider, container, setNow } = seeded()
    provider.bills = [BILL_OCT]
    await container.sync.run({ trigger: 'manual' })
    setNow('2026-10-20T15:00:00.000Z')

    const [bill] = container.dashboard.build('2026-10').bills
    assert.equal(bill?.state, 'open')
    assert.equal(bill?.month, '2026-11')
    assert.equal(bill?.previousPaid, false)
  })
})

describe('faturas por banco', () => {
  it('reconhece o banco pelos nomes das contas quando a conexão chega como MeuPluggy', async () => {
    const { provider, container } = seeded()
    provider.addItem({ institution: { name: 'MeuPluggy', imageUrl: null, color: null } })
    provider.accounts = [
      bankAccount({ name: 'Nu Pagamentos S.A. - Instituição de Pagamento (Conta Pré-paga)', balanceCents: 15000 }),
      cardAccount({ name: 'platinum', number: '0422' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const [bank] = container.dashboard.build('2026-10').banks
    assert.deepEqual(bank?.bank, { id: 'nubank', name: 'Nubank' })
    assert.equal(bank?.balanceCents, 15000)
    assert.deepEqual(bank?.cards.map((card) => card.label), ['Cartão final 0422'])
    assert.equal(container.ledger.listAccounts()[0]?.institution, 'Nubank')
  })

  it('a fatura do mês fica paga quando o cartão recebe o pagamento depois do fechamento', async () => {
    const { provider, container } = seeded()
    provider.bills = [
      { id: 'fatura-out', accountId: CARD, dueDate: '2026-10-07', closingDate: '2026-09-30', totalCents: 50000, currencyCode: 'BRL' },
    ]
    provider.transactions = [
      tx({ accountId: CARD, postedAt: '2026-09-20T12:00:00.000Z', amountCents: 50000, billId: 'fatura-out' }),
    ]
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.dashboard.build('2026-10').banks[0]?.bill?.status, 'closed')

    provider.transactions.push(
      tx({ accountId: CARD, postedAt: '2026-10-06T12:00:00.000Z', amountCents: 50000, type: 'CREDIT', description: 'Pagamento recebido' }),
    )
    await container.sync.run({ trigger: 'manual' })
    const bill = container.dashboard.build('2026-10').banks[0]?.bill
    assert.deepEqual([bill?.status, bill?.paidOn, bill?.amountCents, bill?.estimated], ['paid', '2026-10-06', 50000, false])
  })

  it('fatura que o banco ainda não entregou é estimada pelo ciclo e não herda o pagamento da anterior', async () => {
    const { provider, container } = seeded()
    provider.bills = [
      { id: 'fatura-set', accountId: CARD, dueDate: '2026-09-10', closingDate: '2026-09-03', totalCents: 30000, currencyCode: 'BRL' },
    ]
    provider.transactions = [
      tx({ accountId: CARD, postedAt: '2026-09-10T12:00:00.000Z', amountCents: 30000, type: 'CREDIT', description: 'Pagamento recebido' }),
      // Compras depois do fechamento de setembro, sem fatura informada pelo banco.
      tx({ accountId: CARD, postedAt: '2026-09-12T12:00:00.000Z', amountCents: 7000, status: 'PENDING', billForecastMonth: '2026-09' }),
      tx({ accountId: CARD, postedAt: '2026-09-20T12:00:00.000Z', amountCents: 3000, status: 'PENDING', billForecastMonth: '2026-09' }),
    ]
    await container.sync.run({ trigger: 'manual' })

    const bill = container.dashboard.build('2026-10').banks[0]?.bill
    assert.deepEqual(bill, { month: '2026-10', amountCents: 10000, status: 'closed', dueDate: '2026-10-10', estimated: true, paidOn: null })
  })
})
