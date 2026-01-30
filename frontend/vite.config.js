import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/generate': 'http://127.0.0.1:5000',
      '/analyze': 'http://127.0.0.1:5000',
      '/export': 'http://127.0.0.1:5000',
      '/download': 'http://127.0.0.1:5000'
    }
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  }
})
