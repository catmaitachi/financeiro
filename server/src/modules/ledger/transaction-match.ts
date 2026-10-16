/**
 * Busca ampla no extrato: cada palavra precisa bater com a descrição, o valor,
 * a data ou a conta do lançamento. "netflix 44,90" acha a cobrança de R$ 44,90
 * da Netflix; "12/09 nubank" acha o que caiu no Nubank em 12 de setembro.
 */
import { searchText } from './derive.ts'

export interface MatchableAccount {
  id: string
  /** Banco, nome, rótulo e número da conta, num texto só. */
  text: string
}

export interface MatchFilter {
  /** Condições a juntar com AND no WHERE de `ledger_entries e`. */
  clauses: string[]
  params: Record<string, string | number>
}

const pad = (value: string) => value.padStart(2, '0')
const likeEscape = (value: string) => value.replace(/[\\%_]/g, '\\$&')

export function matchFilter(text: string, accounts: readonly MatchableAccount[]): MatchFilter {
  const clauses: string[] = []
  const params: Record<string, string | number> = {}
  const words = searchText(text)
    .replace(/r\$\s*/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)

  words.forEach((word, index) => {
    const key = (name: string) => `match${index}${name}`
    const textMatch = () => {
      params[key('text')] = `%${likeEscape(word)}%`
      const either = [`e.search_text LIKE :${key('text')} ESCAPE '\\'`]
      const matching = accounts.filter((account) => account.text.includes(word))
      if (matching.length) {
        either.push(`e.account_id IN (${matching.map((_, i) => `:${key(`account${i}`)}`).join(', ')})`)
        matching.forEach((account, i) => (params[key(`account${i}`)] = account.id))
      }
      return either
    }

    let match: RegExpMatchArray | null
    if ((match = word.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/))) {
      // 12/09/2026 ou 12/09/26
      const year = match[3]!.length === 2 ? `20${match[3]}` : match[3]!
      clauses.push(`e.local_date = :${key('date')}`)
      params[key('date')] = `${year}-${pad(match[2]!)}-${pad(match[1]!)}`
    } else if ((match = word.match(/^(\d{1,2})\/(\d{4})$/))) {
      // 09/2026: o mês inteiro
      clauses.push(`e.local_date LIKE :${key('date')}`)
      params[key('date')] = `${match[2]}-${pad(match[1]!)}-%`
    } else if ((match = word.match(/^(\d{1,2})\/(\d{1,2})$/))) {
      // 12/09: o dia, em qualquer ano
      clauses.push(`e.local_date LIKE :${key('date')}`)
      params[key('date')] = `%-${pad(match[2]!)}-${pad(match[1]!)}`
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(word)) {
      clauses.push(`e.local_date = :${key('date')}`)
      params[key('date')] = word
    } else if ((match = word.match(/^(\d{1,3}(?:\.\d{3})+|\d+)[,.](\d{1,2})$/)) && !(word.includes('.') && match[2]!.length !== 2)) {
      // 1.234,56, 44,90, 44,9 ou 44.90: o valor exato
      clauses.push(`e.amount_cents = :${key('amount')}`)
      params[key('amount')] = Number(match[1]!.replace(/\./g, '')) * 100 + Number(match[2]!.padEnd(2, '0'))
    } else if (/^\d+$/.test(word) && word.length <= 7) {
      // 44: qualquer valor de R$ 44,00 a R$ 44,99, ou o número na descrição ou na conta
      const reais = Number(word)
      const either = textMatch()
      either.push(`e.amount_cents BETWEEN :${key('min')} AND :${key('max')}`)
      params[key('min')] = reais * 100
      params[key('max')] = reais * 100 + 99
      clauses.push(`(${either.join(' OR ')})`)
    } else {
      clauses.push(`(${textMatch().join(' OR ')})`)
    }
  })

  return { clauses, params }
}
