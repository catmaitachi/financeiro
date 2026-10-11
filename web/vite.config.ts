import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * Hospedagem estática não conhece as rotas do aplicativo. A cópia em `app/`
 * atende a entrada da demonstração, e o `404.html` devolve a mesma página para
 * qualquer rota interna aberta direto (é assim que o GitHub Pages trata SPAs).
 */
function staticRoutes(outDir: string): Plugin {
  return {
    name: 'financeiro-demo-static-routes',
    closeBundle() {
      const index = path.join(outDir, 'index.html')
      if (!fs.existsSync(index)) return
      fs.mkdirSync(path.join(outDir, 'app'), { recursive: true })
      fs.copyFileSync(index, path.join(outDir, 'app', 'index.html'))
      fs.copyFileSync(index, path.join(outDir, '404.html'))
    },
  }
}

export default defineConfig(({ mode }) => {
  // Modo `demo`: o site público, com o servidor rodando dentro do navegador.
  const demo = mode === 'demo'
  const outDir = path.join(here, demo ? 'dist-demo' : 'dist')

  return {
    root: here,
    // O GitHub Pages serve o projeto em /<repositório>/.
    base: demo ? (process.env.DEMO_BASE ?? '/financeiro/') : '/',
    plugins: [react(), tailwindcss(), ...(demo ? [staticRoutes(outDir)] : [])],
    resolve: {
      alias: {
        '@': path.join(here, 'src'),
        '@shared': path.join(here, '..', 'shared'),
      },
    },
    server: {
      // Só loopback: a interface nunca é exposta na rede local.
      host: 'localhost',
      port: demo ? 5174 : 5173,
      strictPort: true,
      proxy: demo ? undefined : { '/api': `http://127.0.0.1:${process.env.FINANCEIRO_PORT || 8787}` },
    },
    build: { outDir, emptyOutDir: true },
  }
})
