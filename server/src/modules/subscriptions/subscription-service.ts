import type {
  Subscription,
  SubscriptionCadence,
  SubscriptionCharge,
  SubscriptionChargeCandidate,
  SubscriptionList,
  SubscriptionStatus,
  SubscriptionUpdateInput,
  TransactionPage,
} from '../../../../shared/api.ts'
import { accountLabel } from '../../../../shared/banks.ts'
import { addDays, daysBetween, shiftMonths } from '../../../../shared/days.ts'
import { identifyService, parseDomain } from '../../../../shared/services.ts'
import { all, get, run, transaction, type Db } from '../../platform/db/database.ts'
import { badRequest, conflict, notFound } from '../../platform/http/errors.ts'
import { todayLocal, type Clock } from '../../platform/time.ts'
import type { BankDirectory } from '../institutions/bank-directory.ts'
import type { TransactionSearch } from '../ledger/ledger-queries.ts'
import { detectSubscriptions, groupByMerchant, inferCadence, similarAmount, type Candidate, type Charge } from './detector.ts'
import { merchantKey, merchantName } from './merchant-key.ts'

interface SubscriptionRow {
  id: number
  merchant_key: string
  name: string
  domain: string | null
  cadence: SubscriptionCadence
  amount_cents: number
  account_id: string | null
  last_charge_date: string
  status: SubscriptionStatus
  item_id: string | null
  account_type: 'BANK' | 'CREDIT' | null
  account_number: string | null
}

const SUBSCRIPTION_SELECT = `
  SELECT s.id, s.merchant_key, s.name, s.domain, s.cadence, s.amount_cents, s.account_id, s.last_charge_date, s.status,
         a.item_id, a.type AS account_type, a.number AS account_number
    FROM subscriptions s
    LEFT JOIN accounts a ON a.id = s.account_id AND a.removed_at IS NULL`

/** Quantos dias de histórico a detecção olha: treze meses, para alcançar duas cobranças anuais. */
const HISTORY_DAYS = 400
/** Duração de um ciclo, em dias, para decidir que a cobrança parou de vir. */
const CYCLE_DAYS: Record<SubscriptionCadence, number> = { weekly: 7, monthly: 31, yearly: 366 }
const STALE_GRACE_DAYS = 5
/** Quanto o valor de uma assinatura confirmada pode mudar entre duas cobranças e ainda ser ela. */
const CONFIRMED_DRIFT = 0.25
const PER_MONTH: Record<SubscriptionCadence, number> = { weekly: 52 / 12, monthly: 1, yearly: 1 / 12 }
/** Quantas transações a busca do vínculo manual mostra. */
const CANDIDATE_LIMIT = 8

/** O que a assinatura precisa do extrato para achar uma cobrança e vinculá-la à mão. */
export interface ChargeFinder {
  listTransactions(query: TransactionSearch): TransactionPage
}

/** A data da cobrança `steps` ciclos depois de `date`. */
export function chargeAfter(date: string, cadence: SubscriptionCadence, steps: number): string {
  if (cadence === 'weekly') return addDays(date, 7 * steps)
  return shiftMonths(date, cadence === 'monthly' ? steps : 12 * steps)
}

export class SubscriptionService {
  readonly #db: Db
  readonly #clock: Clock
  readonly #banks: BankDirectory
  readonly #finder: ChargeFinder

  constructor(db: Db, clock: Clock, banks: BankDirectory, finder: ChargeFinder) {
    this.#db = db
    this.#clock = clock
    this.#banks = banks
    this.#finder = finder
  }

  /**
   * Reavalia o razão: cria e atualiza sugestões e anexa cobranças novas às
   * assinaturas confirmadas. Roda depois de cada sincronização. Nunca confirma
   * nada sozinha, nunca traz de volta o que foi dispensado ou encerrado e nunca
   * mexe numa cobrança vinculada ou desvinculada à mão.
   */
  detect(): { suggested: number } {
    const today = todayLocal(this.#clock)
    const now = this.#clock().toISOString()
    const charges = this.#charges(today)
    const candidates = detectSubscriptions(charges)
    const byMerchant = groupByMerchant(charges)

    return transaction(this.#db, () => {
      const known = new Map(
        all<{ id: number; merchant_key: string; status: SubscriptionStatus; manual: number }>(
          this.#db,
          `SELECT s.id, s.merchant_key, s.status,
                  EXISTS (SELECT 1 FROM subscription_charges c WHERE c.subscription_id = s.id AND c.manual = 1 AND c.excluded = 0) AS manual
             FROM subscriptions s`,
        ).map((row) => [row.merchant_key, row]),
      )

      // Sugestão cujo padrão sumiu do razão deixa de existir, a não ser que o usuário tenha vinculado algo a ela.
      const found = new Set(candidates.map((candidate) => candidate.key))
      for (const row of known.values()) {
        if (row.status === 'suggested' && !row.manual && !found.has(row.merchant_key)) {
          run(this.#db, 'DELETE FROM subscriptions WHERE id = :id', { id: row.id })
        }
      }

      for (const candidate of candidates) {
        const row = known.get(candidate.key)
        if (!row) this.#suggest(candidate, now)
        else if (row.status === 'suggested') this.#refreshSuggestion(row.id, candidate, now)
      }
      for (const row of known.values()) {
        if (row.status === 'confirmed') this.#attachNewCharges(row.id, byMerchant.get(row.merchant_key) ?? [], now)
      }

      const suggested = get<{ total: number }>(
        this.#db,
        `SELECT COUNT(*) AS total FROM subscriptions WHERE status = 'suggested'`,
      )!.total
      return { suggested }
    })
  }

  /** Saídas do histórico que podem ser cobrança de assinatura: confirmadas, em reais, à vista. */
  #charges(today: string): Charge[] {
    return all<Charge>(
      this.#db,
      `SELECT e.id, e.local_date AS date, e.amount_cents AS amountCents,
              COALESCE(e.merchant_name, e.description) AS text, e.account_id AS accountId
         FROM ledger_entries e
        WHERE e.direction = 'out' AND e.effective_kind = 'regular' AND e.status = 'POSTED'
          AND e.currency_code = 'BRL' AND e.total_installments IS NULL AND e.local_date >= :since
        ORDER BY e.local_date, e.id`,
      { since: addDays(today, -HISTORY_DAYS) },
    )
  }

  #suggest(candidate: Candidate, now: string) {
    const created = run(
      this.#db,
      `INSERT INTO subscriptions
         (merchant_key, name, service_id, domain, cadence, amount_cents, account_id, last_charge_date, status, created_at, updated_at)
       VALUES (:key, :name, :serviceId, :domain, :cadence, :amountCents, :accountId, :lastChargeDate, 'suggested', :now, :now)`,
      { ...this.#fields(candidate), name: candidate.name, serviceId: candidate.serviceId, domain: candidate.domain, key: candidate.key, now },
    )
    this.#link(Number(created.lastInsertRowid), candidate.chargeIds)
  }

  #refreshSuggestion(id: number, candidate: Candidate, now: string) {
    run(
      this.#db,
      `UPDATE subscriptions
          SET cadence = :cadence, amount_cents = :amountCents, account_id = :accountId,
              last_charge_date = :lastChargeDate, updated_at = :now
        WHERE id = :id`,
      { ...this.#fields(candidate), id, now },
    )
    // Só as automáticas são refeitas: a vinculada e a desvinculada à mão ficam como o usuário deixou.
    run(this.#db, 'DELETE FROM subscription_charges WHERE subscription_id = :id AND manual = 0 AND excluded = 0', { id })
    this.#link(id, candidate.chargeIds)
    this.#recompute(id, now)
  }

  #fields(candidate: Candidate) {
    return {
      cadence: candidate.cadence,
      amountCents: candidate.amountCents,
      accountId: candidate.accountId,
      lastChargeDate: candidate.lastChargeDate,
    }
  }

  #link(id: number, transactionIds: readonly string[]) {
    for (const transactionId of transactionIds) {
      run(
        this.#db,
        'INSERT OR IGNORE INTO subscription_charges (subscription_id, transaction_id) VALUES (:id, :transactionId)',
        { id, transactionId },
      )
    }
  }

  /** Depois de confirmada, a assinatura segue o estabelecimento: cada cobrança nova de valor parecido entra sozinha. */
  #attachNewCharges(id: number, charges: readonly Charge[], now: string) {
    const current = get<{ amount_cents: number; last_charge_date: string; account_id: string | null }>(
      this.#db,
      'SELECT amount_cents, last_charge_date, account_id FROM subscriptions WHERE id = :id',
      { id },
    )!
    // Inclui as desvinculadas à mão, que não voltam, e as que já são de outra assinatura.
    const seen = new Set(
      all<{ transaction_id: string }>(this.#db, 'SELECT transaction_id FROM subscription_charges').map(
        (row) => row.transaction_id,
      ),
    )
    let changed = false
    for (const charge of charges) {
      if (seen.has(charge.id) || charge.date <= current.last_charge_date) continue
      if (!similarAmount(charge.amountCents, current.amount_cents, CONFIRMED_DRIFT)) continue
      this.#link(id, [charge.id])
      current.amount_cents = charge.amountCents
      current.last_charge_date = charge.date
      current.account_id = charge.accountId
      changed = true
    }
    if (!changed) return
    run(
      this.#db,
      `UPDATE subscriptions
          SET amount_cents = :amountCents, last_charge_date = :lastChargeDate, account_id = :accountId, updated_at = :now
        WHERE id = :id`,
      { id, amountCents: current.amount_cents, lastChargeDate: current.last_charge_date, accountId: current.account_id, now },
    )
  }

  list(): SubscriptionList {
    const subscriptions = this.#load(`WHERE s.status IN ('suggested', 'confirmed') ORDER BY s.name COLLATE NOCASE, s.id`)
    const monthlyCents = subscriptions
      .filter((subscription) => subscription.status === 'confirmed' && !subscription.stale)
      .reduce((sum, subscription) => sum + Math.round(subscription.amountCents * PER_MONTH[subscription.cadence]), 0)
    return { subscriptions, monthlyCents }
  }

  get(id: number): Subscription {
    const [found] = this.#load('WHERE s.id = :id', { id })
    if (!found) throw notFound('Assinatura não encontrada.')
    return found
  }

  #load(where: string, params: Record<string, string | number> = {}): Subscription[] {
    const today = todayLocal(this.#clock)
    const banks = this.#banks.byItem()
    const rows = all<SubscriptionRow>(this.#db, `${SUBSCRIPTION_SELECT} ${where}`, params)
    const charges = new Map<number, SubscriptionCharge[]>()
    for (const charge of all<{
      subscription_id: number
      id: string
      date: string
      description: string
      amount_cents: number
      manual: number
    }>(
      this.#db,
      `SELECT c.subscription_id, t.id, t.local_date AS date, t.description, t.amount_cents, c.manual
         FROM subscription_charges c
         JOIN transactions t ON t.id = c.transaction_id
        WHERE c.excluded = 0 AND t.removed_at IS NULL
        ORDER BY t.local_date DESC, t.id`,
    )) {
      const list = charges.get(charge.subscription_id) ?? []
      list.push({
        transactionId: charge.id,
        date: charge.date,
        description: charge.description,
        amountCents: charge.amount_cents,
        manual: charge.manual === 1,
      })
      charges.set(charge.subscription_id, list)
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      domain: row.domain,
      cadence: row.cadence,
      amountCents: row.amount_cents,
      status: row.status,
      bank: row.item_id ? (banks.get(row.item_id) ?? null) : null,
      accountLabel: row.account_type ? accountLabel({ type: row.account_type, number: row.account_number }) : null,
      onCard: row.account_type === 'CREDIT',
      lastChargeDate: row.last_charge_date,
      nextChargeDate: chargeAfter(row.last_charge_date, row.cadence, 1),
      stale: daysBetween(row.last_charge_date, today) > 2 * CYCLE_DAYS[row.cadence] + STALE_GRACE_DAYS,
      charges: charges.get(row.id) ?? [],
    }))
  }

  /** Confirma o vínculo entre as cobranças e a assinatura, com nome e site ajustados se o usuário quiser. */
  confirm(id: number, input: SubscriptionUpdateInput = {}): Subscription {
    this.#decide(id, 'suggested', 'confirmed', 'Esta assinatura já foi decidida.', input)
    return this.get(id)
  }

  dismiss(id: number) {
    this.#decide(id, 'suggested', 'dismissed', 'Esta assinatura já foi decidida.')
  }

  end(id: number) {
    this.#decide(id, 'confirmed', 'ended', 'Só uma assinatura confirmada pode ser encerrada.')
  }

  update(id: number, input: SubscriptionUpdateInput): Subscription {
    this.#edit(id, input)
    return this.get(id)
  }

  #decide(id: number, from: SubscriptionStatus, to: SubscriptionStatus, refusal: string, input: SubscriptionUpdateInput = {}) {
    const row = get<{ status: SubscriptionStatus }>(this.#db, 'SELECT status FROM subscriptions WHERE id = :id', { id })
    if (!row) throw notFound('Assinatura não encontrada.')
    if (row.status !== from) throw conflict('subscription_decided', refusal)
    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      this.#edit(id, input)
      run(this.#db, 'UPDATE subscriptions SET status = :to, decided_at = :now, updated_at = :now WHERE id = :id', { id, to, now })
    })
  }

  #edit(id: number, input: SubscriptionUpdateInput) {
    const now = this.#clock().toISOString()
    if (input.name !== undefined) {
      const name = input.name.trim()
      if (!name) throw badRequest('Informe o nome da assinatura.')
      const result = run(this.#db, 'UPDATE subscriptions SET name = :name, updated_at = :now WHERE id = :id', { id, name, now })
      if (!result.changes) throw notFound('Assinatura não encontrada.')
    }
    if (input.domain !== undefined) {
      const domain = input.domain === null || !input.domain.trim() ? null : parseDomain(input.domain)
      if (input.domain?.trim() && !domain) throw badRequest('Informe o site do serviço, como netflix.com.')
      const result = run(this.#db, 'UPDATE subscriptions SET domain = :domain, updated_at = :now WHERE id = :id', { id, domain, now })
      if (!result.changes) throw notFound('Assinatura não encontrada.')
    }
    if (input.cadence !== undefined) {
      if (!(input.cadence in CYCLE_DAYS)) throw badRequest('Informe se a assinatura é semanal, mensal ou anual.')
      const result = run(this.#db, 'UPDATE subscriptions SET cadence = :cadence, updated_at = :now WHERE id = :id', {
        id,
        cadence: input.cadence,
        now,
      })
      if (!result.changes) throw notFound('Assinatura não encontrada.')
    }
  }

  /**
   * Saídas do extrato que batem com o texto (descrição, valor, data ou conta),
   * da mais recente para a mais antiga, sem as que já são desta assinatura.
   */
  searchCharges(id: number, text: string): SubscriptionChargeCandidate[] {
    const subscription = this.get(id)
    if (!text.trim()) return []
    const own = new Set(subscription.charges.map((charge) => charge.transactionId))
    const page = this.#finder.listTransactions({
      match: text,
      direction: 'out',
      // Parcela futura ainda não é cobrança.
      to: todayLocal(this.#clock),
      pageSize: CANDIDATE_LIMIT + own.size,
    })
    const items = page.items.filter((item) => !own.has(item.id)).slice(0, CANDIDATE_LIMIT)
    const owners = this.#owners(items.map((item) => item.id))
    return items.map((item) => ({
      transactionId: item.id,
      date: item.date,
      description: item.description,
      amountCents: item.amountCents,
      bank: item.bank,
      accountLabel: item.accountLabel,
      linkedTo: owners.get(item.id) ?? null,
    }))
  }

  /** De qual assinatura cada transação já é cobrança. */
  #owners(transactionIds: readonly string[]): Map<string, { subscriptionId: number; name: string }> {
    if (!transactionIds.length) return new Map()
    const params = Object.fromEntries(transactionIds.map((transactionId, i) => [`t${i}`, transactionId]))
    return new Map(
      all<{ transaction_id: string; id: number; name: string }>(
        this.#db,
        `SELECT c.transaction_id, s.id, s.name
           FROM subscription_charges c
           JOIN subscriptions s ON s.id = c.subscription_id
          WHERE c.excluded = 0 AND c.transaction_id IN (${transactionIds.map((_, i) => `:t${i}`).join(', ')})`,
        params,
      ).map((row) => [row.transaction_id, { subscriptionId: row.id, name: row.name }]),
    )
  }

  /**
   * Vincula à mão uma saída do extrato como cobrança da assinatura. Ela entra no
   * histórico e, se for a mais recente, passa a valer para o valor, a conta e as
   * próximas datas. A detecção não a desfaz.
   */
  linkCharge(id: number, transactionId: string): Subscription {
    const subscription = get<{ status: SubscriptionStatus }>(this.#db, 'SELECT status FROM subscriptions WHERE id = :id', { id })
    if (!subscription) throw notFound('Assinatura não encontrada.')
    if (subscription.status !== 'suggested' && subscription.status !== 'confirmed') {
      throw conflict('subscription_decided', 'Esta assinatura foi encerrada ou dispensada.')
    }
    const entry = get<{ direction: 'in' | 'out'; amount_cents: number }>(
      this.#db,
      'SELECT direction, amount_cents FROM ledger_entries WHERE id = :transactionId',
      { transactionId },
    )
    if (!entry) throw notFound('Transação não encontrada.')
    if (entry.direction !== 'out' || entry.amount_cents <= 0) throw badRequest('Só uma saída pode ser cobrança de assinatura.')

    const current = get<{ subscription_id: number; excluded: number; name: string }>(
      this.#db,
      `SELECT c.subscription_id, c.excluded, s.name
         FROM subscription_charges c JOIN subscriptions s ON s.id = c.subscription_id
        WHERE c.transaction_id = :transactionId`,
      { transactionId },
    )
    if (current && !current.excluded) {
      // Já vinculada aqui: nada muda, nem se pedirem duas vezes.
      if (current.subscription_id === id) return this.get(id)
      throw conflict('subscription_charge_taken', `Esta cobrança já está em ${current.name}. Desvincule lá primeiro.`)
    }

    const now = this.#clock().toISOString()
    transaction(this.#db, () => {
      // A transação só pode estar numa assinatura: a linha desvinculada (aqui ou em outra) passa a ser este vínculo.
      if (current) {
        run(
          this.#db,
          'UPDATE subscription_charges SET subscription_id = :id, excluded = 0, manual = 1 WHERE transaction_id = :transactionId',
          { id, transactionId },
        )
      } else {
        run(
          this.#db,
          'INSERT INTO subscription_charges (subscription_id, transaction_id, manual) VALUES (:id, :transactionId, 1)',
          { id, transactionId },
        )
      }
      this.#recompute(id, now)
    })
    return this.get(id)
  }

  /**
   * Tira uma cobrança da assinatura. A encontrada pela detecção fica marcada e
   * não volta a ser anexada; a vinculada à mão simplesmente deixa de existir,
   * como se o vínculo nunca tivesse sido feito.
   */
  unlinkCharge(id: number, transactionId: string) {
    const subscription = this.get(id)
    const charge = subscription.charges.find((item) => item.transactionId === transactionId)
    if (!charge) throw notFound('Esta cobrança não está vinculada à assinatura.')
    if (subscription.charges.length === 1) {
      throw conflict('subscription_last_charge', 'Esta é a única cobrança da assinatura. Encerre ou dispense a assinatura.')
    }
    const now = this.#clock().toISOString()
    const params = { id, transactionId }
    transaction(this.#db, () => {
      if (charge.manual) {
        run(this.#db, 'DELETE FROM subscription_charges WHERE subscription_id = :id AND transaction_id = :transactionId', params)
      } else {
        run(this.#db, 'UPDATE subscription_charges SET excluded = 1 WHERE subscription_id = :id AND transaction_id = :transactionId', params)
      }
      this.#recompute(id, now)
    })
  }

  /**
   * Marca uma saída do extrato como assinatura. Entram junto as outras compras
   * de mesmo valor no mesmo estabelecimento, e as próximas chegam sozinhas a
   * cada sincronização. Se o estabelecimento já tem assinatura, a cobrança
   * entra nela, e a sugerida, dispensada ou encerrada volta a valer.
   */
  markTransaction(transactionId: string): Subscription {
    const entry = get<{
      direction: 'in' | 'out'
      amount_cents: number
      text: string
      currency_code: string
      total_installments: number | null
      effective_kind: string
    }>(
      this.#db,
      `SELECT direction, amount_cents, COALESCE(merchant_name, description) AS text, currency_code, total_installments, effective_kind
         FROM ledger_entries WHERE id = :transactionId`,
      { transactionId },
    )
    if (!entry) throw notFound('Transação não encontrada.')
    if (entry.direction !== 'out' || entry.amount_cents <= 0) throw badRequest('Só uma saída pode ser assinatura.')
    if (entry.effective_kind !== 'regular') throw badRequest('Pagamento de fatura e transferência entre contas não são assinatura.')
    if (entry.total_installments !== null) throw badRequest('Compra parcelada não é assinatura.')
    if (entry.currency_code !== 'BRL') throw badRequest('Só cobranças em reais podem ser assinatura.')
    const key = merchantKey(entry.text)
    if (!key) throw badRequest('Não deu para reconhecer o estabelecimento desta transação.')

    // Se a transação já é cobrança de alguma assinatura, é essa que passa a valer.
    const owner = this.#ownerOf(transactionId)
    const existing =
      owner === null
        ? get<{ id: number; status: SubscriptionStatus }>(this.#db, 'SELECT id, status FROM subscriptions WHERE merchant_key = :key', { key })
        : get<{ id: number; status: SubscriptionStatus }>(this.#db, 'SELECT id, status FROM subscriptions WHERE id = :owner', { owner })
    // Já marcada: nada muda, nem se pedirem duas vezes.
    if (existing && owner === existing.id && existing.status === 'confirmed') return this.get(existing.id)

    const now = this.#clock().toISOString()
    const today = todayLocal(this.#clock)
    const id = transaction(this.#db, () => {
      let id: number
      if (existing) {
        id = existing.id
        if (existing.status !== 'confirmed') {
          run(this.#db, `UPDATE subscriptions SET status = 'confirmed', decided_at = :now, updated_at = :now WHERE id = :id`, { id, now })
        }
      } else {
        const service = identifyService(entry.text)
        const created = run(
          this.#db,
          `INSERT INTO subscriptions
             (merchant_key, name, service_id, domain, cadence, amount_cents, last_charge_date, status, created_at, decided_at, updated_at)
           VALUES (:key, :name, :serviceId, :domain, 'monthly', :amountCents, :today, 'confirmed', :now, :now, :now)`,
          {
            key,
            name: service?.name ?? merchantName(entry.text),
            serviceId: service?.id ?? null,
            domain: service?.domain ?? null,
            amountCents: entry.amount_cents,
            today,
            now,
          },
        )
        id = Number(created.lastInsertRowid)
      }

      // A marcada entra como vínculo manual, mesmo que antes tenha sido desvinculada daqui ou de outra.
      if (this.#ownerOf(transactionId) !== id) {
        run(this.#db, 'DELETE FROM subscription_charges WHERE transaction_id = :transactionId', { transactionId })
        run(
          this.#db,
          'INSERT INTO subscription_charges (subscription_id, transaction_id, manual) VALUES (:id, :transactionId, 1)',
          { id, transactionId },
        )
      }
      // As do mesmo lugar e mesmo valor entram como encontradas. A desvinculada à mão e a de outra assinatura ficam onde estão.
      const taken = new Set(
        all<{ transaction_id: string }>(this.#db, 'SELECT transaction_id FROM subscription_charges').map((row) => row.transaction_id),
      )
      const twins = (groupByMerchant(this.#charges(today)).get(key) ?? []).filter(
        (charge) => charge.amountCents === entry.amount_cents && !taken.has(charge.id),
      )
      this.#link(
        id,
        twins.map((charge) => charge.id),
      )

      // A sugerida já tem a cadência da detecção; a nova e a que volta tiram a sua das cobranças.
      if (existing?.status !== 'suggested' && existing?.status !== 'confirmed') {
        const dates = all<{ local_date: string }>(
          this.#db,
          `SELECT t.local_date FROM subscription_charges c JOIN transactions t ON t.id = c.transaction_id
            WHERE c.subscription_id = :id AND c.excluded = 0 AND t.removed_at IS NULL`,
          { id },
        ).map((row) => row.local_date)
        run(this.#db, 'UPDATE subscriptions SET cadence = :cadence WHERE id = :id', { id, cadence: inferCadence(dates) })
      }
      this.#recompute(id, now)
      return id
    })
    return this.get(id)
  }

  /** A assinatura de que a transação é cobrança agora, se houver. */
  #ownerOf(transactionId: string): number | null {
    return (
      get<{ subscription_id: number }>(
        this.#db,
        'SELECT subscription_id FROM subscription_charges WHERE transaction_id = :transactionId AND excluded = 0',
        { transactionId },
      )?.subscription_id ?? null
    )
  }

  /** Valor, conta e última data seguem a cobrança vinculada mais recente. */
  #recompute(id: number, now: string) {
    const latest = get<{ amount_cents: number; local_date: string; account_id: string }>(
      this.#db,
      `SELECT t.amount_cents, t.local_date, t.account_id
         FROM subscription_charges c
         JOIN transactions t ON t.id = c.transaction_id
        WHERE c.subscription_id = :id AND c.excluded = 0 AND t.removed_at IS NULL
        ORDER BY t.local_date DESC, t.posted_at DESC, t.id
        LIMIT 1`,
      { id },
    )
    if (!latest) return
    run(
      this.#db,
      `UPDATE subscriptions
          SET amount_cents = :amountCents, last_charge_date = :date, account_id = :accountId, updated_at = :now
        WHERE id = :id`,
      { id, amountCents: latest.amount_cents, date: latest.local_date, accountId: latest.account_id, now },
    )
  }

  /**
   * Cobranças esperadas das assinaturas confirmadas e ativas, dentro do intervalo.
   * Começam depois da última cobrança: uma esperada que ainda não veio continua no dia dela.
   */
  upcoming(from: string, to: string): { subscription: Subscription; date: string }[] {
    const expected: { subscription: Subscription; date: string }[] = []
    for (const subscription of this.#load(`WHERE s.status = 'confirmed'`)) {
      if (subscription.stale) continue
      for (let step = 1; ; step++) {
        const date = chargeAfter(subscription.lastChargeDate, subscription.cadence, step)
        if (date > to) break
        if (date >= from) expected.push({ subscription, date })
      }
    }
    return expected
  }

  /** Cobranças já feitas das assinaturas confirmadas, dentro do intervalo. */
  charged(from: string, to: string): { subscription: Subscription; charge: SubscriptionCharge }[] {
    return this.#load(`WHERE s.status = 'confirmed'`).flatMap((subscription) =>
      subscription.charges
        .filter((charge) => charge.date >= from && charge.date <= to)
        .map((charge) => ({ subscription, charge })),
    )
  }
}
