import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  // Relative asset URLs are required for both GitHub Pages (/KFE-New/)
  // and Capacitor's local WebView origin (where /KFE-New/ does not exist).
  base: './',
  plugins: [vue()],
  server: {
    host: true,
    watch: {
      usePolling: true,
      interval: 100
    }
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
