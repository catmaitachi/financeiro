import type { Context } from 'hono'
import { z } from 'zod'
import { isMonth } from '../../../../shared/months.ts'
import { badRequest } from './errors.ts'

export const monthSchema = z.string().refine(isMonth, 'Use o formato AAAA-MM.')
export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD.')
export const uuidSchema = z.uuid('Identificador inválido.')

function fail(error: z.ZodError): never {
  const issue = error.issues[0]
  const where = issue?.path.length ? `${issue.path.join('.')}: ` : ''
  throw badRequest(`${where}${issue?.message ?? 'Dados inválidos.'}`, z.flattenError(error))
}

export async function parseBody<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown
  try {
    raw = await c.req.json()
  } catch {
    throw badRequest('O corpo da requisição precisa ser um JSON válido.')
  }
  const result = schema.safeParse(raw)
  return result.success ? result.data : fail(result.error)
}

export function parseQuery<S extends z.ZodType>(c: Context, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.query())
  return result.success ? result.data : fail(result.error)
}

export function parseParam<S extends z.ZodType>(c: Context, name: string, schema: S): z.infer<S> {
  const result = schema.safeParse(c.req.param(name))
  return result.success ? result.data : fail(result.error)
}
