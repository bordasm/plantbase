import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/web',
  plugins: [react(), tailwindcss()],
  server: {
    port: 4200,
    proxy: {
      '/api': 'http://localhost:3000',
      '/debug': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    watch: false,
    passWithNoTests: true,
    globals: true,
    environment: 'node',
  },
})
