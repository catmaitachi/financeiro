import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { CARD, CHECKING, seeded, tx } from './support.ts'

const NOW = '2026-10-13T15:00:00.000Z'
const at = (date: string) => `${date}T12:00:00.000Z`

const tela = (date: string, amountCents = 3990) =>
  tx({ accountId: CARD, postedAt: at(date), amountCents, description: 'Assinatura Tela Mais' })
const netflix = (date: string) => tx({ accountId: CARD, postedAt: at(date), amountCents: 4490, description: 'NETFLIX.COM' })
const academia = (date: string) =>
  tx({ accountId: CHECKING, postedAt: at(date), amountCents: 12900, description: 'Academia Corpo Ativo' })

async function scenario() {
  const context = seeded({ now: NOW })
  context.provider.transactions = [
    tela('2026-07-11'),
    tela('2026-08-11'),
    tela('2026-09-11'),
    netflix('2026-08-20'),
    netflix('2026-09-20'),
    academia('2026-07-12'),
    academia('2026-08-12'),
    academia('2026-09-12'),
    // Parcelado e compra avulsa não são assinatura.
    tx({ accountId: CARD, postedAt: at('2026-08-02'), amountCents: 20000, description: 'Loja Parcela', installmentNumber: 1, totalInstallments: 3 }),
    tx({ accountId: CARD, postedAt: at('2026-09-02'), amountCents: 20000, description: 'Loja Parcela', installmentNumber: 2, totalInstallments: 3 }),
    tx({ accountId: CARD, postedAt: at('2026-10-02'), amountCents: 20000, description: 'Loja Parcela', installmentNumber: 3, totalInstallments: 3 }),
    tx({ accountId: CHECKING, postedAt: at('2026-09-30'), amountCents: 5500, description: 'Padaria Aurora' }),
  ]
  await context.container.sync.run({ trigger: 'manual' })
  const byName = (name: string) => context.container.subscriptions.list().subscriptions.find((item) => item.name === name)
  return { ...context, byName }
}

describe('assinaturas', () => {
  it('a sincronização sugere as cobranças recorrentes, com serviço, conta e próxima data', async () => {
    const { container, byName } = await scenario()
    const { subscriptions, monthlyCents } = container.subscriptions.list()
    assert.deepEqual(
      subscriptions.map((item) => [item.name, item.status, item.cadence]),
      [
        ['Academia Corpo Ativo', 'suggested', 'monthly'],
        ['Netflix', 'suggested', 'monthly'],
        ['Tela Mais', 'suggested', 'monthly'],
      ],
    )
    assert.equal(monthlyCents, 0)

    const service = byName('Netflix')!
    assert.equal(service.domain, 'netflix.com')
    assert.equal(service.onCard, true)
    assert.equal(service.accountLabel, 'Cartão final 1234')
    assert.equal(service.lastChargeDate, '2026-09-20')
    assert.equal(service.nextChargeDate, '2026-10-20')
    assert.equal(service.charges.length, 2)
    assert.equal(byName('Academia Corpo Ativo')!.onCard, false)
  })

  it('confirmar vincula, aceita nome e site, e passa a contar no total mensal', async () => {
    const { container, byName } = await scenario()
    const confirmed = container.subscriptions.confirm(byName('Tela Mais')!.id, { name: 'Tela+', domain: 'https://www.telamais.com.br/conta' })
    assert.equal(confirmed.status, 'confirmed')
    assert.equal(confirmed.name, 'Tela+')
    assert.equal(confirmed.domain, 'telamais.com.br')
    assert.equal(container.subscriptions.list().monthlyCents, 3990)
    assert.throws(() => container.subscriptions.confirm(confirmed.id))
    assert.throws(() => container.subscriptions.update(confirmed.id, { domain: 'isso não é site' }))
  })

  it('a confirmada recebe sozinha as cobranças novas e acompanha o reajuste', async () => {
    const { container, provider, setNow, byName } = await scenario()
    const { id } = byName('Tela Mais')!
    container.subscriptions.confirm(id)

    setNow('2026-10-12T15:00:00.000Z')
    provider.transactions.push(tela('2026-10-11', 4490))
    await container.sync.run({ trigger: 'manual' })

    const after = container.subscriptions.get(id)
    assert.equal(after.charges.length, 4)
    assert.equal(after.amountCents, 4490)
    assert.equal(after.lastChargeDate, '2026-10-11')
    assert.equal(after.nextChargeDate, '2026-11-11')
  })

  it('a dispensada some e não volta na sincronização seguinte', async () => {
    const { container, byName } = await scenario()
    container.subscriptions.dismiss(byName('Academia Corpo Ativo')!.id)
    await container.sync.run({ trigger: 'manual' })
    assert.equal(byName('Academia Corpo Ativo'), undefined)
    assert.equal(container.subscriptions.list().subscriptions.length, 2)
  })

  it('sugestão acompanha o razão: sem o padrão, ela deixa de existir', async () => {
    const { container, provider, byName } = await scenario()
    provider.transactions = provider.transactions.filter((item) => item.description !== 'NETFLIX.COM')
    await container.sync.run({ trigger: 'manual' })
    container.subscriptions.detect()
    assert.equal(byName('Tela Mais')?.status, 'suggested')
  })

  it('desvincular uma cobrança recalcula a última e não a anexa de novo', async () => {
    const { container, byName } = await scenario()
    const subscription = container.subscriptions.confirm(byName('Tela Mais')!.id)
    const latest = subscription.charges[0]!
    container.subscriptions.unlinkCharge(subscription.id, latest.transactionId)
    await container.sync.run({ trigger: 'manual' })

    const after = container.subscriptions.get(subscription.id)
    assert.equal(after.charges.length, 2)
    assert.equal(after.lastChargeDate, '2026-08-11')
    assert.ok(after.charges.every((charge) => charge.transactionId !== latest.transactionId))
  })

  it('encerrada sai da lista; sem cobrança há dois ciclos fica marcada como parada', async () => {
    const { container, setNow, byName } = await scenario()
    const tela = container.subscriptions.confirm(byName('Tela Mais')!.id)
    const service = container.subscriptions.confirm(byName('Netflix')!.id)
    assert.equal(tela.stale, false)

    setNow('2026-12-20T15:00:00.000Z')
    assert.equal(container.subscriptions.get(tela.id).stale, true)
    assert.equal(container.subscriptions.list().monthlyCents, 0)

    container.subscriptions.end(service.id)
    assert.equal(byName('Netflix'), undefined)
  })

  it('cobrança esperada que ainda não veio continua no dia dela', async () => {
    const { container, setNow, byName } = await scenario()
    container.subscriptions.confirm(byName('Netflix')!.id)
    setNow('2026-10-25T15:00:00.000Z')
    assert.deepEqual(
      container.subscriptions.upcoming('2026-10-01', '2026-10-31').map((item) => item.date),
      ['2026-10-20'],
    )
  })

  it('projeta as próximas cobranças só das confirmadas, depois da última', async () => {
    const { container, byName } = await scenario()
    container.subscriptions.confirm(byName('Netflix')!.id)
    const upcoming = container.subscriptions.upcoming('2026-10-01', '2026-12-31')
    assert.deepEqual(
      upcoming.map((item) => [item.subscription.name, item.date]),
      [
        ['Netflix', '2026-10-20'],
        ['Netflix', '2026-11-20'],
        ['Netflix', '2026-12-20'],
      ],
    )
    assert.deepEqual(
      container.subscriptions.charged('2026-09-01', '2026-09-30').map((item) => item.charge.date),
      ['2026-09-20'],
    )
  })
})

describe('assinaturas: vínculo manual', () => {
  /** Cobrança que a detecção não reconhece: outro texto, outra conta, outro valor. */
  async function withStrayCharge() {
    const context = await scenario()
    const stray = tx({ accountId: CHECKING, postedAt: at('2026-10-09'), amountCents: 4290, description: 'PIX STREAMING TM' })
    const salary = tx({ accountId: CHECKING, postedAt: at('2026-10-05'), amountCents: 500000, description: 'Salário', type: 'CREDIT' })
    context.provider.transactions.push(stray, salary)
    await context.container.sync.run({ trigger: 'manual' })
    return { ...context, stray, salary }
  }

  it('a busca acha saídas pela descrição, pelo valor, pela data e pela conta', async () => {
    const { container, byName, stray } = await withStrayCharge()
    const { id } = byName('Tela Mais')!
    const found = (text: string) => container.subscriptions.searchCharges(id, text).map((item) => item.transactionId)

    assert.deepEqual(found('streaming'), [stray.id])
    assert.deepEqual(found('R$ 42,90'), [stray.id])
    assert.deepEqual(found('09/10/2026'), [stray.id])
    assert.deepEqual(found('conta 42'), [stray.id])
    assert.deepEqual(found(''), [])
    // Entrada não é cobrança, e as cobranças da própria assinatura não aparecem.
    assert.deepEqual(found('salario'), [])
    assert.deepEqual(found('tela'), [])

    const [candidate] = container.subscriptions.searchCharges(id, 'streaming')
    assert.equal(candidate!.accountLabel, 'Conta')
    assert.equal(candidate!.linkedTo, null)
    // A de outra assinatura aparece com o nome dela.
    const taken = container.subscriptions.searchCharges(byName('Netflix')!.id, 'tela mais')
    assert.equal(taken.length, 3)
    assert.ok(taken.every((item) => item.linkedTo?.name === 'Tela Mais'))
  })

  it('vincular entra no histórico e recalcula valor, conta e próximas datas', async () => {
    const { container, byName, stray } = await withStrayCharge()
    const { id } = container.subscriptions.confirm(byName('Tela Mais')!.id)

    const linked = container.subscriptions.linkCharge(id, stray.id)
    assert.equal(linked.charges.length, 4)
    assert.deepEqual(linked.charges[0], {
      transactionId: stray.id,
      date: '2026-10-09',
      description: 'PIX STREAMING TM',
      amountCents: 4290,
      manual: true,
    })
    assert.equal(linked.amountCents, 4290)
    assert.equal(linked.lastChargeDate, '2026-10-09')
    assert.equal(linked.nextChargeDate, '2026-11-09')
    assert.equal(linked.onCard, false)
    assert.deepEqual(
      container.subscriptions.upcoming('2026-10-01', '2026-11-30').map((item) => item.date),
      ['2026-11-09'],
    )
    assert.deepEqual(
      container.subscriptions.charged('2026-10-01', '2026-10-31').map((item) => item.charge.transactionId),
      [stray.id],
    )
    // Pedir de novo não duplica.
    assert.equal(container.subscriptions.linkCharge(id, stray.id).charges.length, 4)
  })

  it('a sincronização e a detecção não desfazem nem duplicam o vínculo manual', async () => {
    const { container, byName, stray } = await withStrayCharge()
    // Na sugerida a detecção refaz as cobranças a cada rodada: a manual precisa sobreviver.
    const { id } = byName('Netflix')!
    container.subscriptions.linkCharge(id, stray.id)

    await container.sync.run({ trigger: 'manual' })
    container.subscriptions.detect()
    const suggested = container.subscriptions.get(id)
    assert.equal(suggested.status, 'suggested')
    assert.deepEqual(
      suggested.charges.map((charge) => [charge.date, charge.manual]),
      [
        ['2026-10-09', true],
        ['2026-09-20', false],
        ['2026-08-20', false],
      ],
    )
    assert.equal(suggested.lastChargeDate, '2026-10-09')

    container.subscriptions.confirm(id)
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.subscriptions.get(id).charges.length, 3)
  })

  it('a sugerida com vínculo manual não some quando o padrão sai do razão', async () => {
    const { container, provider, byName, stray } = await withStrayCharge()
    const { id } = byName('Netflix')!
    container.subscriptions.linkCharge(id, stray.id)
    provider.transactions = provider.transactions.filter((item) => item.description !== 'NETFLIX.COM')
    await container.sync.run({ trigger: 'manual' })

    const after = container.subscriptions.get(id)
    assert.deepEqual(after.charges.map((charge) => charge.transactionId), [stray.id])
  })

  it('desfazer o vínculo manual volta as datas e não deixa rastro; dá para vincular de novo', async () => {
    const { container, db, byName, stray } = await withStrayCharge()
    const { id } = container.subscriptions.confirm(byName('Tela Mais')!.id)
    container.subscriptions.linkCharge(id, stray.id)

    container.subscriptions.unlinkCharge(id, stray.id)
    await container.sync.run({ trigger: 'manual' })
    const after = container.subscriptions.get(id)
    assert.equal(after.charges.length, 3)
    assert.equal(after.lastChargeDate, '2026-09-11')
    assert.equal(after.nextChargeDate, '2026-10-11')
    assert.equal(after.amountCents, 3990)
    assert.equal(after.onCard, true)
    const [free] = container.subscriptions.searchCharges(byName('Netflix')!.id, 'streaming')
    assert.equal(free!.linkedTo, null)
    assert.equal(db.prepare('SELECT COUNT(*) AS total FROM subscription_charges WHERE transaction_id = ?').get(stray.id)!.total, 0)

    assert.equal(container.subscriptions.linkCharge(id, stray.id).lastChargeDate, '2026-10-09')
  })

  it('recusa entrada, transação de outra assinatura e assinatura encerrada', async () => {
    const { container, byName, stray, salary } = await withStrayCharge()
    const tela = byName('Tela Mais')!
    const netflix = byName('Netflix')!

    assert.throws(() => container.subscriptions.linkCharge(tela.id, salary.id), /saída/)
    assert.throws(() => container.subscriptions.linkCharge(netflix.id, tela.charges[0]!.transactionId), /Tela Mais/)
    assert.throws(() => container.subscriptions.linkCharge(tela.id, 'dddddddd-0000-4000-8000-999999999999'), /não encontrada/)

    container.subscriptions.dismiss(tela.id)
    assert.throws(() => container.subscriptions.linkCharge(tela.id, stray.id), /encerrada ou dispensada/)
  })

  it('a transação desvinculada de uma assinatura pode ir para outra', async () => {
    const { container, byName } = await withStrayCharge()
    const tela = container.subscriptions.confirm(byName('Tela Mais')!.id)
    const netflix = byName('Netflix')!
    const oldest = tela.charges.at(-1)!

    container.subscriptions.unlinkCharge(tela.id, oldest.transactionId)
    const moved = container.subscriptions.linkCharge(netflix.id, oldest.transactionId)
    assert.ok(moved.charges.some((charge) => charge.transactionId === oldest.transactionId && charge.manual))
    assert.equal(container.subscriptions.get(tela.id).charges.length, 2)
    // Mais antiga que as da Netflix: entra no histórico sem mexer na próxima data.
    assert.equal(moved.lastChargeDate, '2026-09-20')
  })
})

describe('marcar transação como assinatura', () => {
  const clube = (date: string, amountCents = 2990) =>
    tx({ accountId: CARD, postedAt: at(date), amountCents, description: 'Clube do Livro Página' })

  async function withClube() {
    const context = await scenario()
    const marked = clube('2026-09-05')
    const older = clube('2026-08-05')
    const extra = clube('2026-09-15', 4500)
    context.provider.transactions.push(older, marked, extra)
    await context.container.sync.run({ trigger: 'manual' })
    return { ...context, marked, older, extra }
  }

  it('cria a assinatura confirmada com as compras de mesmo valor no mesmo lugar', async () => {
    const { container, byName, marked, older } = await withClube()
    // Duas cobranças de um estabelecimento fora do catálogo não chegam a virar sugestão.
    assert.equal(byName('Clube do Livro Página'), undefined)

    const subscription = container.subscriptions.markTransaction(marked.id)
    assert.equal(subscription.status, 'confirmed')
    assert.equal(subscription.name, 'Clube do Livro Página')
    assert.equal(subscription.cadence, 'monthly')
    assert.equal(subscription.amountCents, 2990)
    assert.equal(subscription.lastChargeDate, '2026-09-05')
    assert.equal(subscription.nextChargeDate, '2026-10-05')
    assert.equal(subscription.onCard, true)
    // A de outro valor no mesmo lugar fica de fora; só a marcada conta como vínculo manual.
    assert.deepEqual(
      subscription.charges.map((charge) => [charge.transactionId, charge.manual]),
      [
        [marked.id, true],
        [older.id, false],
      ],
    )
    assert.equal(container.subscriptions.list().monthlyCents, 2990)
  })

  it('as próximas cobranças entram sozinhas e marcar de novo não muda nada', async () => {
    const { container, provider, setNow, marked } = await withClube()
    const { id } = container.subscriptions.markTransaction(marked.id)
    assert.equal(container.subscriptions.markTransaction(marked.id).charges.length, 2)

    setNow('2026-10-07T15:00:00.000Z')
    provider.transactions.push(clube('2026-10-05'))
    await container.sync.run({ trigger: 'manual' })
    const after = container.subscriptions.get(id)
    assert.equal(after.charges.length, 3)
    assert.equal(after.lastChargeDate, '2026-10-05')
  })

  it('a marcada sozinha nasce mensal e pode virar anual, com a próxima data e o custo mensal acompanhando', async () => {
    const { container, provider, setNow } = await scenario()
    const yearly = tx({ accountId: CARD, postedAt: at('2026-10-02'), amountCents: 24000, description: 'Escudo Antivírus' })
    provider.transactions.push(yearly)
    setNow(NOW)
    await container.sync.run({ trigger: 'manual' })

    const marked = container.subscriptions.markTransaction(yearly.id)
    assert.equal(marked.cadence, 'monthly')
    const changed = container.subscriptions.update(marked.id, { cadence: 'yearly' })
    assert.equal(changed.cadence, 'yearly')
    assert.equal(changed.nextChargeDate, '2027-10-02')
    assert.equal(container.subscriptions.list().monthlyCents, 2000)
    // A detecção não desfaz a escolha de uma confirmada.
    await container.sync.run({ trigger: 'manual' })
    assert.equal(container.subscriptions.get(marked.id).cadence, 'yearly')
  })

  it('tira a cadência das datas: duas compras com uma semana entre elas viram semanal', async () => {
    const context = seeded({ now: NOW })
    const last = tx({ accountId: CHECKING, postedAt: at('2026-10-06'), amountCents: 3500, description: 'Lavanderia Bolha' })
    context.provider.transactions = [
      tx({ accountId: CHECKING, postedAt: at('2026-09-29'), amountCents: 3500, description: 'Lavanderia Bolha' }),
      last,
    ]
    await context.container.sync.run({ trigger: 'manual' })
    const subscription = context.container.subscriptions.markTransaction(last.id)
    assert.equal(subscription.cadence, 'weekly')
    assert.equal(subscription.charges.length, 2)
    assert.equal(subscription.nextChargeDate, '2026-10-13')
  })

  it('no estabelecimento que já tem assinatura, a sugerida é confirmada e a dispensada volta', async () => {
    const { container, byName } = await scenario()
    const tela = byName('Tela Mais')!
    const confirmed = container.subscriptions.markTransaction(tela.charges[0]!.transactionId)
    assert.equal(confirmed.id, tela.id)
    assert.equal(confirmed.status, 'confirmed')
    assert.equal(confirmed.cadence, 'monthly')

    const netflix = byName('Netflix')!
    container.subscriptions.dismiss(netflix.id)
    const revived = container.subscriptions.markTransaction(netflix.charges[0]!.transactionId)
    assert.equal(revived.id, netflix.id)
    assert.equal(revived.status, 'confirmed')
    assert.equal(revived.charges.length, 2)
  })

  it('a desvinculada à mão não volta quando outra compra do lugar é marcada', async () => {
    const { container, byName } = await scenario()
    const { id } = byName('Tela Mais')!
    container.subscriptions.confirm(id)
    const [latest, middle] = container.subscriptions.get(id).charges
    container.subscriptions.unlinkCharge(id, middle!.transactionId)
    // Marcar a mais recente de novo não traz a desvinculada de volta.
    const after = container.subscriptions.markTransaction(latest!.transactionId)
    assert.ok(!after.charges.some((charge) => charge.transactionId === middle!.transactionId))
    // Já marcar a própria desvinculada é pedir que ela volte.
    const back = container.subscriptions.markTransaction(middle!.transactionId)
    assert.ok(back.charges.some((charge) => charge.transactionId === middle!.transactionId && charge.manual))
  })

  it('recusa entrada, compra parcelada e transação inexistente', async () => {
    const context = await scenario()
    const salary = tx({ accountId: CHECKING, postedAt: at('2026-10-05'), amountCents: 500000, description: 'Salário', type: 'CREDIT' })
    context.provider.transactions.push(salary)
    await context.container.sync.run({ trigger: 'manual' })
    const installment = context.provider.transactions.find((item) => item.description === 'Loja Parcela')!

    assert.throws(() => context.container.subscriptions.markTransaction(salary.id), /saída/)
    assert.throws(() => context.container.subscriptions.markTransaction(installment.id), /parcelada/)
    assert.throws(() => context.container.subscriptions.markTransaction('dddddddd-0000-4000-8000-999999999999'), /não encontrada/)
  })
})
