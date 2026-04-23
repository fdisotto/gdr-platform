import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))

await setup({
  rootDir,
  dev: false,
  server: true,
  build: false,
  nuxtConfig: {
    nitro: {
      output: {
        dir: resolve(rootDir, '.output')
      }
    }
  },
  env: { DATABASE_URL: ':memory:' }
})

describe('POST /api/parties', () => {
  it('crea una party e torna seed, masterToken, initialState', async () => {
    const r = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'Fab' }
    }) as Record<string, unknown>
    expect(typeof r.seed).toBe('string')
    expect(typeof r.masterToken).toBe('string')
    expect(typeof r.sessionToken).toBe('string')
    const initial = r.initialState as { areasState: unknown[], players: unknown[] }
    expect(initial.areasState).toHaveLength(14)
    expect(initial.players).toHaveLength(1)
  })

  it('rifiuta body invalido con 400 invalid_payload', async () => {
    await expect($fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'a' } // troppo corto
    })).rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_payload' })
  })
})
