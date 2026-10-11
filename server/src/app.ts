import fs from 'node:fs'
import path from 'node:path'
import type { Hono } from 'hono'
import { createApi } from './api.ts'
import type { Container } from './container.ts'
import { localOnly } from './platform/http/security.ts'

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export function createApp(container: Container) {
  const app = createApi(container, [localOnly])
  serveInterface(app, container.config.webDistDir)
  return app
}

/** Em produção local, o mesmo servidor entrega a interface já compilada. */
function serveInterface(app: Hono, distDir: string) {
  app.get('*', (c) => {
    const index = path.join(distDir, 'index.html')
    if (!fs.existsSync(index)) {
      return c.text('Interface ainda não compilada. Rode "npm run build" ou use "npm run dev".', 503)
    }
    const requested = path.normalize(path.join(distDir, decodeURIComponent(c.req.path)))
    const inside = requested.startsWith(distDir + path.sep)
    const file = inside && fs.existsSync(requested) && fs.statSync(requested).isFile() ? requested : index
    const immutable = file !== index && file.includes(`${path.sep}assets${path.sep}`)
    return c.body(fs.readFileSync(file), 200, {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
    })
  })
}
