/**
 * Identidade dos bancos. O agregador pode entregar todas as conexões com o
 * mesmo nome (pelo MeuPluggy, todas chegam como "MeuPluggy"), então o banco é
 * reconhecido pelos nomes das contas da conexão e ganha um nome padronizado.
 *
 * Acrescentar um banco é acrescentar uma linha em `BANKS` (e, se houver, a
 * marca dele em `web/src/features/banks/BankLogo.tsx`).
 */

export interface BankRef {
  /** Identificador estável: o do catálogo, ou um derivado do nome quando o banco não é conhecido. */
  id: string
  name: string
}

interface KnownBank extends BankRef {
  /** Testado contra os nomes da conexão, já em minúsculas e sem acentos. */
  pattern: RegExp
}

const BANKS: readonly KnownBank[] = [
  { id: 'nubank', name: 'Nubank', pattern: /\bnubank\b|\bnu pagamentos\b/ },
  { id: 'inter', name: 'Inter', pattern: /\bbanco inter\b|\binter\b/ },
  { id: 'picpay', name: 'PicPay', pattern: /\bpic ?pay\b/ },
]

/** Nomes de agregador, que não dizem de qual banco é a conexão. */
const AGGREGATORS = /^(meu ?pluggy|pluggy.*)$/

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/**
 * Reconhece o banco de uma conexão.
 * @param connectorName nome informado pelo agregador
 * @param accountNames nomes das contas e cartões da conexão
 */
export function identifyBank(connectorName: string, accountNames: readonly string[]): BankRef {
  const hints = [connectorName, ...accountNames].map(normalize)
  for (const bank of BANKS) {
    if (hints.some((hint) => bank.pattern.test(hint))) return { id: bank.id, name: bank.name }
  }
  const connector = connectorName.trim()
  if (connector && !AGGREGATORS.test(normalize(connector))) {
    return { id: normalize(connector).replace(/[^a-z0-9]+/g, '-'), name: connector }
  }
  return { id: 'outro', name: 'Outro banco' }
}

/** Nome padronizado de uma conta dentro do banco: "Conta" ou "Cartão final 0422". */
export function accountLabel(account: { type: 'BANK' | 'CREDIT'; number: string | null }): string {
  if (account.type === 'BANK') return 'Conta'
  const digits = account.number?.replace(/\D/g, '').slice(-4)
  return digits ? `Cartão final ${digits}` : 'Cartão'
}
