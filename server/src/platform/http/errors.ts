import type { ContentfulStatusCode } from 'hono/utils/http-status'

/** Erro com mensagem pronta para a interface (em português e acionável). */
export class AppError extends Error {
  readonly status: ContentfulStatusCode
  readonly code: string
  readonly details?: unknown

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message)
    this.name = 'AppError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details)

export const notFound = (message: string) => new AppError(404, 'not_found', message)

export const conflict = (code: string, message: string) => new AppError(409, code, message)
