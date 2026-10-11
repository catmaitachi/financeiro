import path from 'node:path'
import { fileURLToPath } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const here = path.dirname(fileURLToPath(import.meta.url))

export default defineConfig({
  root: here,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.join(here, 'src'),
      '@shared': path.join(here, '..', 'shared'),
    },
  },
  server: {
    // Só loopback: a interface nunca é exposta na rede local.
    host: 'localhost',
    port: 5173,
    strictPort: true,
    proxy: { '/api': `http://127.0.0.1:${process.env.FINANCEIRO_PORT || 8787}` },
  },
  build: { outDir: path.join(here, 'dist'), emptyOutDir: true },
})
