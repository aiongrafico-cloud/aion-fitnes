import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// `npm run build:single` genera un único index.html autocontenido (útil para compartir/previsualizar).
export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'single' ? [viteSingleFile()] : [])],
  build: { chunkSizeWarningLimit: 1200, ...(mode === 'single' ? { outDir: 'dist-single' } : {}) },
}))
