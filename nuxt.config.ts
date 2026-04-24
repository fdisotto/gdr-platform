import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt'
  ],

  // MVP: app SPA puro. Non serve SSR per un gdr con stato realtime (WebSocket
  // e localStorage). Disabilita anche il warning Reka-UI SSR-optimized slot.
  ssr: false,

  devtools: { enabled: true },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'dark',
    fallback: 'dark'
  },

  alias: {
    '~~': fileURLToPath(new URL('./', import.meta.url))
  },

  routeRules: {
  },

  compatibilityDate: '2025-01-15',

  nitro: {
    alias: {
      '~~': fileURLToPath(new URL('./', import.meta.url))
    },
    experimental: { websocket: true }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  }
})
