const SENSITIVE_KEY = /secret|token|api[-_]?key|authorization|password|credential/i

/** Remove qualquer campo com nome sensível antes de um objeto chegar ao log. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 4 || value === null || typeof value !== 'object') return value
  if (Array.isArray(value)) return value.map((item) => redact(item, depth + 1))
  return Object.fromEntries(
    Object.entries(value).map(([key, inner]) => [
      key,
      SENSITIVE_KEY.test(key) ? '[oculto]' : redact(inner, depth + 1),
    ]),
  )
}

export interface Logger {
  info(message: string, meta?: Record<string, unknown>): void
  warn(message: string, meta?: Record<string, unknown>): void
  error(message: string, meta?: Record<string, unknown>): void
}

function write(level: string, message: string, meta?: Record<string, unknown>) {
  const suffix = meta ? ` ${JSON.stringify(redact(meta))}` : ''
  const line = `${new Date().toISOString()} ${level} ${message}${suffix}`
  if (level === 'ERROR') console.error(line)
  else console.log(line)
}

export const consoleLogger: Logger = {
  info: (message, meta) => write('INFO', message, meta),
  warn: (message, meta) => write('WARN', message, meta),
  error: (message, meta) => write('ERROR', message, meta),
}

export const silentLogger: Logger = { info() {}, warn() {}, error() {} }
