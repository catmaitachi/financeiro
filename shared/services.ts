/**
 * Catálogo de serviços por assinatura. Reconhece o serviço pelo texto do
 * lançamento e diz o nome padronizado e o domínio de onde vem o logotipo.
 *
 * Acrescentar um serviço é acrescentar uma linha em `SERVICES`. A ordem
 * importa: o mais específico vem antes ("youtube" antes de "google").
 */

export interface ServiceRef {
  id: string
  name: string
  /** Domínio do serviço, usado para buscar o logotipo. */
  domain: string
}

interface KnownService extends ServiceRef {
  /** Testado contra o texto do lançamento, já em minúsculas e sem acentos. */
  pattern: RegExp
}

const SERVICES: readonly KnownService[] = [
  { id: 'netflix', name: 'Netflix', domain: 'netflix.com', pattern: /\bnetflix\b/ },
  { id: 'spotify', name: 'Spotify', domain: 'spotify.com', pattern: /\bspotify\b/ },
  { id: 'youtube', name: 'YouTube Premium', domain: 'youtube.com', pattern: /\byoutube/ },
  { id: 'google-one', name: 'Google One', domain: 'one.google.com', pattern: /\bgoogle (one|storage)\b/ },
  { id: 'prime-video', name: 'Amazon Prime', domain: 'primevideo.com', pattern: /\b(amazon ?prime|prime ?video|amzn ?prime)\b/ },
  { id: 'kindle', name: 'Kindle Unlimited', domain: 'amazon.com.br', pattern: /\bkindle\b/ },
  { id: 'disney', name: 'Disney+', domain: 'disneyplus.com', pattern: /\bdisney ?(plus|\+)/ },
  { id: 'max', name: 'Max', domain: 'max.com', pattern: /\bhbo ?max\b|\bhelp\.max\.com\b/ },
  { id: 'globoplay', name: 'Globoplay', domain: 'globoplay.globo.com', pattern: /\bglobo ?play\b/ },
  { id: 'paramount', name: 'Paramount+', domain: 'paramountplus.com', pattern: /\bparamount ?(plus|\+)/ },
  { id: 'apple-tv', name: 'Apple TV+', domain: 'tv.apple.com', pattern: /\bapple ?tv\b/ },
  { id: 'crunchyroll', name: 'Crunchyroll', domain: 'crunchyroll.com', pattern: /\bcrunchyroll\b/ },
  { id: 'deezer', name: 'Deezer', domain: 'deezer.com', pattern: /\bdeezer\b/ },
  { id: 'apple-music', name: 'Apple Music', domain: 'music.apple.com', pattern: /\bapple ?music\b/ },
  { id: 'icloud', name: 'iCloud+', domain: 'icloud.com', pattern: /\bicloud\b/ },
  { id: 'apple', name: 'Apple', domain: 'apple.com', pattern: /\bapple\.com\/bill\b|\bapple services\b/ },
  { id: 'chatgpt', name: 'ChatGPT', domain: 'chatgpt.com', pattern: /\bchatgpt\b|\bopenai\b/ },
  { id: 'claude', name: 'Claude', domain: 'claude.ai', pattern: /\bclaude\b|\banthropic\b/ },
  { id: 'github', name: 'GitHub', domain: 'github.com', pattern: /\bgithub\b/ },
  { id: 'cursor', name: 'Cursor', domain: 'cursor.com', pattern: /\bcursor\b/ },
  { id: 'adobe', name: 'Adobe', domain: 'adobe.com', pattern: /\badobe\b/ },
  { id: 'microsoft-365', name: 'Microsoft 365', domain: 'microsoft.com', pattern: /\bmicrosoft ?365\b|\boffice ?365\b|\bmsft\b/ },
  { id: 'xbox', name: 'Xbox Game Pass', domain: 'xbox.com', pattern: /\bxbox\b|\bgame ?pass\b/ },
  { id: 'playstation', name: 'PlayStation Plus', domain: 'playstation.com', pattern: /\bplaystation\b|\bps ?plus\b/ },
  { id: 'nintendo', name: 'Nintendo Switch Online', domain: 'nintendo.com', pattern: /\bnintendo\b/ },
  { id: 'notion', name: 'Notion', domain: 'notion.so', pattern: /\bnotion\b/ },
  { id: 'canva', name: 'Canva', domain: 'canva.com', pattern: /\bcanva\b/ },
  { id: 'dropbox', name: 'Dropbox', domain: 'dropbox.com', pattern: /\bdropbox\b/ },
  { id: 'figma', name: 'Figma', domain: 'figma.com', pattern: /\bfigma\b/ },
  { id: 'duolingo', name: 'Duolingo', domain: 'duolingo.com', pattern: /\bduolingo\b/ },
  { id: 'linkedin', name: 'LinkedIn Premium', domain: 'linkedin.com', pattern: /\blinkedin\b/ },
  { id: 'meli-mais', name: 'Meli+', domain: 'mercadolivre.com.br', pattern: /\bmeli ?(\+|mais)|\bmercado ?livre nivel\b/ },
  { id: 'ifood-clube', name: 'Clube iFood', domain: 'ifood.com.br', pattern: /\bifood ?(clube|club)\b|\bclube ifood\b/ },
  { id: 'uber-one', name: 'Uber One', domain: 'uber.com', pattern: /\buber ?one\b/ },
  { id: 'rappi-prime', name: 'Rappi Prime', domain: 'rappi.com.br', pattern: /\brappi ?(prime|pro)\b/ },
  { id: 'smart-fit', name: 'Smart Fit', domain: 'smartfit.com.br', pattern: /\bsmart ?fit\b/ },
  { id: 'wellhub', name: 'Wellhub', domain: 'wellhub.com', pattern: /\bwellhub\b|\bgympass\b/ },
  { id: 'totalpass', name: 'TotalPass', domain: 'totalpass.com', pattern: /\btotal ?pass\b/ },
  { id: 'google', name: 'Google', domain: 'google.com', pattern: /\bgoogle\b/ },
]

/** Minúsculas e sem acentos: a forma em que os padrões são testados. */
export const plainText = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()

/** Reconhece o serviço citado no texto de um lançamento. */
export function identifyService(text: string): ServiceRef | null {
  const plain = plainText(text)
  const found = SERVICES.find((service) => service.pattern.test(plain))
  return found ? { id: found.id, name: found.name, domain: found.domain } : null
}

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/

/** Extrai o domínio do que o usuário digitou (`https://www.netflix.com/br` vira `netflix.com`), ou `null` se não for um. */
export function parseDomain(input: string): string | null {
  const host = input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '')
    .replace(/^www\./, '')
  return DOMAIN_RE.test(host) ? host : null
}
