import { fileURLToPath } from 'node:url'

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@pinia/nuxt'
  ],

  // SPA puro: evita problemi di singleton module-level condiviso tra richieste
  // SSR e bug Reka-UI ConfigProvider. L'MVP è stateful (ws + localStorage),
  // ssr non aggiunge valore. Rivalutare in Plan 6.
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
