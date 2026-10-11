import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { competenceOf, kindOf, pairInternalTransfers, searchText, type KindInput, type TransferCandidate } from '../src/modules/ledger/derive.ts'
import { localDateOf, localTimeOf } from '../src/platform/time.ts'

describe('data civil em America/Sao_Paulo', () => {
  it('meia-noite UTC é lida como a própria data, sem voltar um dia', () => {
    assert.equal(localDateOf('2026-10-01T00:00:00.000Z'), '2026-10-01')
  })

  it('instantes reais são convertidos para o fuso de São Paulo', () => {
    assert.equal(localDateOf('2026-10-01T02:30:00.000Z'), '2026-09-30')
    assert.equal(localDateOf('2026-10-01T03:00:00.000Z'), '2026-10-01')
    assert.equal(localDateOf('2026-10-01T23:59:59-03:00'), '2026-10-01')
  })

  it('datas sem fuso (faturas) são lidas como estão', () => {
    assert.equal(localDateOf('2026-11-10T00:00:00'), '2026-11-10')
    assert.equal(localDateOf('2026-11-10'), '2026-11-10')
  })
})

describe('horário em America/Sao_Paulo', () => {
  it('converte o instante da Pluggy para o relógio de São Paulo', () => {
    assert.equal(localTimeOf('2025-10-09T20:59:48.000Z'), '17:59')
    assert.equal(localTimeOf('2026-10-01T02:30:00.000Z'), '23:30')
    assert.equal(localTimeOf('2026-10-01T23:59:59-03:00'), '23:59')
  })

  it('não inventa horário quando o banco só informou o dia', () => {
    assert.equal(localTimeOf('2026-10-01T03:00:00.000Z'), null)
    assert.equal(localTimeOf('2026-10-01T00:00:00.000Z'), null)
    assert.equal(localTimeOf('2026-10-01T00:00:00'), null)
    assert.equal(localTimeOf('2026-10-01'), null)
  })
})

describe('competência', () => {
  const bills = [
    { id: 'fatura-out', dueDate: '2026-10-10', closingDate: '2026-10-03' },
    { id: 'fatura-nov', dueDate: '2026-11-10', closingDate: '2026-11-03' },
  ]

  it('em conta, é o mês da data', () => {
    assert.deepEqual(
      competenceOf({ accountType: 'BANK', localDate: '2026-10-28', billId: null, billForecastMonth: null }, bills),
      { month: '2026-10', source: 'date' },
    )
  })

  it('em cartão, usa primeiro o vencimento da fatura vinculada', () => {
    assert.deepEqual(
      competenceOf(
        { accountType: 'CREDIT', localDate: '2026-10-28', billId: 'fatura-nov', billForecastMonth: '2026-12' },
        bills,
      ),
      { month: '2026-11', source: 'bill' },
    )
  })

  it('em cartão, cai na previsão quando a fatura ainda está aberta', () => {
    assert.deepEqual(
      competenceOf({ accountType: 'CREDIT', localDate: '2026-10-28', billId: null, billForecastMonth: '2026-12' }, bills),
      { month: '2026-12', source: 'forecast' },
    )
    // `billId` de uma fatura que o provedor não listou também cai na previsão.
    assert.deepEqual(
      competenceOf(
        { accountType: 'CREDIT', localDate: '2026-10-28', billId: 'desconhecida', billForecastMonth: '2026-12' },
        bills,
      ),
      { month: '2026-12', source: 'forecast' },
    )
  })

  it('previsão que aponta para uma fatura fechada antes da compra não é confiável', () => {
    // Compra em 18/10, depois do fechamento de 03/10: não pode ser da fatura de outubro.
    assert.deepEqual(
      competenceOf({ accountType: 'CREDIT', localDate: '2026-10-18', billId: null, billForecastMonth: '2026-10' }, bills),
      { month: null, source: 'none' },
    )
    // Compra antes do fechamento: a previsão continua valendo.
    assert.deepEqual(
      competenceOf({ accountType: 'CREDIT', localDate: '2026-10-02', billId: null, billForecastMonth: '2026-10' }, bills),
      { month: '2026-10', source: 'forecast' },
    )
    // Fatura sem data de fechamento conhecida: não há o que contradizer.
    assert.deepEqual(
      competenceOf({ accountType: 'CREDIT', localDate: '2026-10-18', billId: null, billForecastMonth: '2026-10' }, [
        { id: 'fatura-out', dueDate: '2026-10-10', closingDate: null },
      ]),
      { month: '2026-10', source: 'forecast' },
    )
  })

  it('sem fatura nem previsão, fica sem competência em vez de usar o mês da compra', () => {
    assert.deepEqual(
      competenceOf({ accountType: 'CREDIT', localDate: '2026-10-28', billId: null, billForecastMonth: null }, bills),
      { month: null, source: 'none' },
    )
  })
})

describe('classificação do lançamento', () => {
  const base: KindInput = {
    accountType: 'BANK',
    direction: 'out',
    description: 'Compra',
    category: { id: null, description: null },
    counterpartyDocument: null,
    ownerDocument: '12345678901',
  }

  it('compra comum é gasto regular', () => {
    assert.equal(kindOf({ ...base, category: { id: '10000000', description: 'Groceries' } }), 'regular')
  })

  it('pagamento de fatura é reconhecido pela categoria, por id ou por nome', () => {
    assert.equal(kindOf({ ...base, category: { id: '05100000', description: null } }), 'bill_payment')
    assert.equal(kindOf({ ...base, category: { id: '99990000', description: 'Credit card payment' } }), 'bill_payment')
  })

  it('no cartão, o crédito de pagamento recebido também é pagamento de fatura', () => {
    assert.equal(
      kindOf({ ...base, accountType: 'CREDIT', direction: 'in', description: 'Pagamento recebido' }),
      'bill_payment',
    )
    // Um estorno no cartão não é pagamento.
    assert.equal(
      kindOf({ ...base, accountType: 'CREDIT', direction: 'in', description: 'Estorno Loja X' }),
      'regular',
    )
  })

  it('transferência de mesma titularidade é interna, pela categoria ou pelo documento', () => {
    assert.equal(kindOf({ ...base, category: { id: '04020000', description: null } }), 'internal_transfer')
    assert.equal(kindOf({ ...base, counterpartyDocument: '12345678901' }), 'internal_transfer')
    assert.equal(kindOf({ ...base, counterpartyDocument: '99999999999' }), 'regular')
  })
})

describe('pareamento de transferências entre contas próprias', () => {
  const candidate = (overrides: Partial<TransferCandidate>): TransferCandidate => ({
    id: 'x',
    accountId: 'conta-a',
    direction: 'out',
    amountCents: 50000,
    localDate: '2026-10-05',
    categoryId: '05070000',
    foreignCounterparty: false,
    ...overrides,
  })

  it('pareia saída e entrada de mesmo valor em contas diferentes', () => {
    const pairs = pairInternalTransfers([
      candidate({ id: 'saida' }),
      candidate({ id: 'entrada', accountId: 'conta-b', direction: 'in', localDate: '2026-10-06' }),
    ])
    assert.equal(pairs.get('saida'), 'entrada')
    assert.equal(pairs.get('entrada'), 'saida')
  })

  it('não pareia na mesma conta, com valor diferente ou com mais de um dia de distância', () => {
    assert.equal(pairInternalTransfers([candidate({ id: 'a' }), candidate({ id: 'b', direction: 'in' })]).size, 0)
    assert.equal(
      pairInternalTransfers([
        candidate({ id: 'a' }),
        candidate({ id: 'b', accountId: 'conta-b', direction: 'in', amountCents: 50001 }),
      ]).size,
      0,
    )
    assert.equal(
      pairInternalTransfers([
        candidate({ id: 'a' }),
        candidate({ id: 'b', accountId: 'conta-b', direction: 'in', localDate: '2026-10-08' }),
      ]).size,
      0,
    )
  })

  it('não pareia quando a outra ponta é um terceiro ou quando não é transferência', () => {
    assert.equal(
      pairInternalTransfers([
        candidate({ id: 'a', foreignCounterparty: true }),
        candidate({ id: 'b', accountId: 'conta-b', direction: 'in' }),
      ]).size,
      0,
    )
    // Salário (renda) e aluguel de mesmo valor não são uma transferência interna.
    assert.equal(
      pairInternalTransfers([
        candidate({ id: 'aluguel' }),
        candidate({ id: 'salario', accountId: 'conta-b', direction: 'in', categoryId: '01000000' }),
      ]).size,
      0,
    )
  })

  it('cada lançamento participa de no máximo um par', () => {
    const pairs = pairInternalTransfers([
      candidate({ id: 'saida-1' }),
      candidate({ id: 'saida-2', localDate: '2026-10-06' }),
      candidate({ id: 'entrada', accountId: 'conta-b', direction: 'in' }),
    ])
    assert.equal(pairs.size, 2)
    assert.equal(pairs.get('entrada'), 'saida-1')
  })
})

describe('texto de busca', () => {
  it('ignora acentos e caixa', () => {
    assert.equal(searchText('Café São João', null, 'PADARIA'), 'cafe sao joao padaria')
  })
})
