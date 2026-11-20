import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      }
    }
  },
  build: {
    // Готовая сборка ложится в public/ сервера.
    // emptyOutDir: false — не удалять vendor и уже лежащие assets.
    // copyPublicDir: false — не затирать favicon/icons из frontend/public поверх клиентских.
    outDir: '../public',
    emptyOutDir: false,
    copyPublicDir: false,
  },
})// rebuild
