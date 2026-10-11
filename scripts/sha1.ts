/**
 * SHA-1 síncrono em TypeScript puro, só para derivar ids e sementes estáveis
 * dos dados fictícios. Existe porque o simulador também roda no navegador
 * (demo), onde `node:crypto` não existe. Não usar para nada de segurança.
 */
export function sha1Hex(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const words: number[] = []
  for (let i = 0; i < bytes.length; i++) words[i >> 2] = (words[i >> 2] ?? 0) | (bytes[i]! << (24 - (i % 4) * 8))
  words[bytes.length >> 2] = (words[bytes.length >> 2] ?? 0) | (0x80 << (24 - (bytes.length % 4) * 8))
  const total = (((bytes.length + 8) >> 6) + 1) * 16
  for (let i = 0; i < total; i++) words[i] ??= 0
  words[total - 2] = Math.floor((bytes.length * 8) / 2 ** 32)
  words[total - 1] = (bytes.length * 8) >>> 0

  const rotate = (value: number, bits: number) => (value << bits) | (value >>> (32 - bits))
  let [h0, h1, h2, h3, h4] = [0x67452301, 0xefcdab89, 0x98badcfe, 0x10325476, 0xc3d2e1f0]
  const w = new Array<number>(80)

  for (let block = 0; block < total; block += 16) {
    for (let i = 0; i < 80; i++) {
      w[i] = i < 16 ? words[block + i]! : rotate(w[i - 3]! ^ w[i - 8]! ^ w[i - 14]! ^ w[i - 16]!, 1)
    }
    let [a, b, c, d, e] = [h0, h1, h2, h3, h4]
    for (let i = 0; i < 80; i++) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6]
      const next = (rotate(a, 5) + f + e + k + w[i]!) | 0
      ;[e, d, c, b, a] = [d, c, rotate(b, 30), a, next]
    }
    h0 = (h0 + a) | 0
    h1 = (h1 + b) | 0
    h2 = (h2 + c) | 0
    h3 = (h3 + d) | 0
    h4 = (h4 + e) | 0
  }
  return [h0, h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, '0')).join('')
}
