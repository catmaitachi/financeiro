import type { MiddlewareHandler } from 'hono'
import { AppError } from './errors.ts'

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]'])

function hostnameOf(hostHeader: string): string {
  return hostHeader.replace(/:\d+$/, '').toLowerCase()
}

/**
 * A aplicação não tem login porque só atende a própria máquina. Estas duas
 * verificações mantêm essa premissa verdadeira mesmo com um navegador aberto
 * em sites de terceiros:
 *
 * - `Host` precisa ser local, o que bloqueia DNS rebinding;
 * - requisições que alteram dados precisam vir de uma origem local, o que
 *   bloqueia CSRF a partir de outras páginas.
 */
export const localOnly: MiddlewareHandler = async (c, next) => {
  const host = c.req.header('host')
  if (!host || !LOCAL_HOSTNAMES.has(hostnameOf(host))) {
    throw new AppError(403, 'forbidden_host', 'Esta aplicação só atende requisições locais.')
  }

  const method = c.req.method
  if (method !== 'GET' && method !== 'HEAD') {
    const origin = c.req.header('origin')
    if (origin) {
      let originHost = ''
      try {
        originHost = new URL(origin).hostname
      } catch {
        // origem malformada cai na recusa abaixo
      }
      if (!LOCAL_HOSTNAMES.has(originHost)) {
        throw new AppError(403, 'forbidden_origin', 'Esta aplicação só aceita alterações feitas localmente.')
      }
    }
  }

  await next()
}

/** Respostas da API nunca devem ser guardadas em cache pelo navegador. */
export const noStore: MiddlewareHandler = async (c, next) => {
  await next()
  c.header('Cache-Control', 'no-store')
}
