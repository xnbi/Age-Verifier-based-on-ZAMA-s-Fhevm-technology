import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      buffer: 'buffer/',
      util: 'util/',
    },
  },
  optimizeDeps: {
    include: [
      '@fhevm/sdk',
      'buffer',
      'util',
    ],
    exclude: [],
  },
  define: {
    global: 'globalThis',
    'process.env': {},
  },
  build: {
    target: 'es2020',
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      external: [],
    },
  },
  server: {
    port: 5173,
    host: true,
  },
})
