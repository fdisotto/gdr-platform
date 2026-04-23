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

describe('POST /api/parties/:seed/resume', () => {
  it('riprende una sessione valida', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM' }
    }) as { seed: string, sessionToken: string, playerId: string }

    const r = await $fetch(`/api/parties/${create.seed}/resume`, {
      method: 'POST',
      body: { sessionToken: create.sessionToken }
    }) as { playerId: string }

    expect(r.playerId).toBe(create.playerId)
  })

  it('sessione invalida → 401', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM' }
    }) as { seed: string }

    await expect($fetch(`/api/parties/${create.seed}/resume`, {
      method: 'POST',
      body: { sessionToken: 'bad-token' }
    })).rejects.toMatchObject({ statusCode: 401 })
  })

  it('party inesistente → 404', async () => {
    await expect($fetch('/api/parties/00000000-0000-0000-0000-000000000000/resume', {
      method: 'POST',
      body: { sessionToken: 'any' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})
