/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_BUILD__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          const normalizedId = id.replace(/\\/g, '/')

          if (!normalizedId.includes('node_modules')) return undefined

          if (normalizedId.includes('@supabase/supabase-js')) return 'supabase-vendor'
          if (
            normalizedId.includes('/react/') ||
            normalizedId.includes('/react-dom/') ||
            normalizedId.includes('/react-router/') ||
            normalizedId.includes('/react-router-dom/') ||
            normalizedId.includes('/scheduler/') ||
            normalizedId.includes('@remix-run/router')
          ) return 'react-vendor'
          if (normalizedId.includes('/tone/')) return 'tone-vendor'
          if (normalizedId.includes('/lucide-react/')) return 'icons-vendor'
          if (normalizedId.includes('/canvas-confetti/')) return 'effects-vendor'
          if (normalizedId.includes('/driver.js/')) return 'tutorial-vendor'

          return 'vendor'
        },
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'vite.svg'],
      manifest: {
        name: 'PusselPaus – Hjärngympa',
        short_name: 'PusselPaus',
        description: 'Blixtsnabb, reklamfri webbportal för hjärngympa. Sudoku och mer!',
        theme_color: '#6366f1',
        background_color: '#0f172a',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: '/vite.svg',
            sizes: 'any',
            type: 'image/svg+xml',
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
