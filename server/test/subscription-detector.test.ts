import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { identifyService, parseDomain } from '../../shared/services.ts'
import { detectSubscriptions, inferCadence, type Charge } from '../src/modules/subscriptions/detector.ts'
import { merchantKey, merchantName } from '../src/modules/subscriptions/merchant-key.ts'

let sequence = 0
const charge = (text: string, amountCents: number, date: string, accountId = 'cartao'): Charge => ({
  id: `t${++sequence}`,
  date,
  amountCents,
  text,
  accountId,
})
const monthly = (text: string, amountCents: number, day: string, months: string[]) =>
  months.map((month) => charge(text, amountCents, `${month}-${day}`))

describe('catálogo de serviços', () => {
  it('reconhece o serviço apesar de prefixos, caixa e acentos', () => {
    assert.equal(identifyService('NETFLIX.COM SAO PAULO BR')?.id, 'netflix')
    assert.equal(identifyService('PAG*Spotify')?.domain, 'spotify.com')
    assert.equal(identifyService('GOOGLE *YouTubePremium')?.id, 'youtube')
    assert.equal(identifyService('Padaria do Zé'), null)
  })

  it('extrai o domínio do que foi digitado', () => {
    assert.equal(parseDomain('https://www.Netflix.com/br/login'), 'netflix.com')
    assert.equal(parseDomain('fibraconecta.com.br'), 'fibraconecta.com.br')
    assert.equal(parseDomain('não é um site'), null)
    assert.equal(parseDomain('localhost'), null)
  })
})

describe('chave do estabelecimento', () => {
  it('serviço conhecido usa a chave do catálogo', () => {
    assert.equal(merchantKey('NETFLIX.COM 0800'), 'servico:netflix')
    assert.equal(merchantKey('Netflix'), 'servico:netflix')
  })

  it('ignora intermediário, números e termos genéricos', () => {
    assert.equal(merchantKey('PAG*AcademiaCorpo 02/12'), merchantKey('PAG*ACADEMIACORPO 03/12'))
    assert.equal(merchantKey('Assinatura Tela Mais'), 'tela mais')
    assert.equal(merchantKey('MP *FIBRA CONECTA 4455 SAO PAULO BR'), 'fibra conecta')
    assert.equal(merchantName('MP *FIBRA CONECTA 4455'), 'Fibra Conecta')
    assert.equal(merchantName('Tarifa de manutenção'), 'Tarifa de Manutenção')
  })

  it('texto só com ruído não vira chave', () => {
    assert.equal(merchantKey('PIX 12345'), '')
  })
})

describe('detecção de assinaturas', () => {
  it('três cobranças mensais do mesmo estabelecimento viram sugestão', () => {
    const found = detectSubscriptions(monthly('Assinatura Tela Mais', 3990, '11', ['2026-07', '2026-08', '2026-09']))
    assert.equal(found.length, 1)
    assert.deepEqual(
      { ...found[0], chargeIds: found[0]!.chargeIds.length },
      {
        key: 'tela mais',
        name: 'Tela Mais',
        serviceId: null,
        domain: null,
        cadence: 'monthly',
        amountCents: 3990,
        accountId: 'cartao',
        lastChargeDate: '2026-09-11',
        chargeIds: 3,
      },
    )
  })

  it('duas cobranças só bastam para serviço do catálogo', () => {
    assert.equal(detectSubscriptions(monthly('Padaria Aurora', 2500, '05', ['2026-08', '2026-09'])).length, 0)
    const [netflix] = detectSubscriptions(monthly('NETFLIX.COM', 4490, '05', ['2026-08', '2026-09']))
    assert.equal(netflix?.name, 'Netflix')
    assert.equal(netflix?.domain, 'netflix.com')
  })

  it('aceita reajuste e a data andando alguns dias', () => {
    const [found] = detectSubscriptions([
      charge('Academia Corpo Ativo', 11900, '2026-06-12'),
      charge('Academia Corpo Ativo', 11900, '2026-07-13'),
      charge('Academia Corpo Ativo', 12900, '2026-08-12'),
      charge('Academia Corpo Ativo', 12900, '2026-09-14'),
    ])
    assert.equal(found?.amountCents, 12900)
    assert.equal(found?.chargeIds.length, 4)
  })

  it('compras avulsas no mesmo estabelecimento não escondem a assinatura', () => {
    const [found] = detectSubscriptions([
      ...monthly('Amazon Prime', 1990, '08', ['2026-07', '2026-08', '2026-09']),
      charge('Amazon Prime', 25900, '2026-08-20'),
      charge('Amazon Prime', 8750, '2026-09-02'),
    ])
    assert.equal(found?.amountCents, 1990)
    assert.equal(found?.chargeIds.length, 3)
  })

  it('compras frequentes sem ritmo não são assinatura', () => {
    const found = detectSubscriptions([
      charge('Mercado Bom Preço', 18000, '2026-09-01'),
      charge('Mercado Bom Preço', 17500, '2026-09-04'),
      charge('Mercado Bom Preço', 18200, '2026-09-19'),
      charge('Mercado Bom Preço', 17900, '2026-09-21'),
    ])
    assert.deepEqual(found, [])
  })

  it('reconhece cadência semanal e anual', () => {
    const weekly = detectSubscriptions(['2026-09-04', '2026-09-11', '2026-09-18'].map((date) => charge('Feira Orgânica', 6000, date)))
    assert.equal(weekly[0]?.cadence, 'weekly')
    assert.equal(weekly[0]?.name, 'Feira Orgânica')
    const yearly = detectSubscriptions([charge('Domínio Registro', 4000, '2025-09-20'), charge('Domínio Registro', 4000, '2026-09-21')])
    assert.equal(yearly[0]?.cadence, 'yearly')
  })

  it('só conta a sequência mais recente: uma pausa longa recomeça a contagem', () => {
    const found = detectSubscriptions([
      ...monthly('Clube do Livro', 5990, '10', ['2025-11', '2025-12', '2026-01']),
      ...monthly('Clube do Livro', 5990, '10', ['2026-08', '2026-09']),
    ])
    assert.deepEqual(found, [])
  })
})

describe('cadência de uma assinatura marcada à mão', () => {
  it('sai do intervalo mediano entre as datas, e fica mensal sem ritmo ou com uma data só', () => {
    assert.equal(inferCadence(['2026-09-05']), 'monthly')
    assert.equal(inferCadence(['2026-08-05', '2026-09-05', '2026-10-04']), 'monthly')
    assert.equal(inferCadence(['2026-09-29', '2026-10-06', '2026-10-13']), 'weekly')
    assert.equal(inferCadence(['2025-10-01', '2026-09-28']), 'yearly')
    assert.equal(inferCadence(['2026-09-01', '2026-09-15']), 'monthly')
  })
})
