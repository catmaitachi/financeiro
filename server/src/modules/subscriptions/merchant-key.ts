/**
 * De quem é a cobrança. Reduz o texto do lançamento a uma chave estável, para
 * que a mesma assinatura seja reconhecida mês após mês mesmo quando o banco
 * muda números e prefixos. Funções puras.
 */
import { identifyService, plainText } from '../../../../shared/services.ts'

/** Intermediários de pagamento que vêm colados antes do nome do estabelecimento. */
const ACQUIRER = /^(pag|pagseguro|mp|mercadopago|mercado pago|ebn|dl|pg|iz|izettle|sumup|htm|ebw|paypal|picpay|stone|cielo|ton)\s*\*\s*/

const NOISE: readonly RegExp[] = [
  /\b\d{1,2}\s*\/\s*\d{1,2}\b/g, // parcela ou data: 02/12
  /\b(assinatura|mensalidade|pagamento|compra|d[eé]bito autom[aá]tico|pix enviado|pix)\b/g,
  /\b(s[aã]o paulo|rio de janeiro|osasco|barueri|curitiba)\b/g,
  /\b(br|bra|sp|rj|ltda|s\/?a|me|eireli)\b/g,
  /[^\p{L}]+/gu,
]

/** Texto do estabelecimento, em minúsculas, sem intermediário, números e termos genéricos. */
function clean(lowercase: string): string {
  let cleaned = lowercase.trim()
  while (ACQUIRER.test(cleaned)) cleaned = cleaned.replace(ACQUIRER, '')
  for (const noise of NOISE) cleaned = cleaned.replace(noise, ' ')
  return cleaned.replace(/\s+/g, ' ').trim()
}

/** Chave do estabelecimento: o serviço do catálogo, quando reconhecido, ou o nome limpo. Vazia quando não sobra nada. */
export function merchantKey(text: string): string {
  const service = identifyService(text)
  if (service) return `servico:${service.id}`
  return clean(plainText(text))
}

/** Palavras que continuam minúsculas no meio de um nome. */
const PARTICLES = new Set(['a', 'as', 'o', 'os', 'e', 'de', 'da', 'das', 'do', 'dos', 'em', 'na', 'no', 'para'])

/** Nome apresentável para um estabelecimento fora do catálogo: "tarifa de manutencao" vira "Tarifa de Manutenção". */
export function merchantName(text: string): string {
  return clean(text.toLowerCase())
    .split(' ')
    .map((word, index) => (index > 0 && PARTICLES.has(word) ? word : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ')
}
