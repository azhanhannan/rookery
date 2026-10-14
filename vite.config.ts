/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defaultClientConditions, defineConfig } from 'vite'

// The API server (server/src/main.ts) listens on 5181; ROOKERY_API overrides it (e2e uses its own).
const api = process.env.ROOKERY_API ?? 'http://127.0.0.1:5181'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { proxy: { '/api': api } },
  // onnxruntime-web (Maia worker only): use the build that loads its WASM glue from public/ort at runtime
  // instead of bundling it, so the 14 MB .wasm isn't emitted a second time into dist/assets.
  resolve: { conditions: ['onnxruntime-web-use-extern-wasm', ...defaultClientConditions] },
  worker: { format: 'es' },
  // Served as-is (plain ESM, no bare imports): pre-bundling it on first use would reload the page mid-dialog.
  optimizeDeps: { exclude: ['onnxruntime-web'] },
  test: {
    environment: 'jsdom',
    include: ['tests/unit/**/*.test.ts'],
  },
})
