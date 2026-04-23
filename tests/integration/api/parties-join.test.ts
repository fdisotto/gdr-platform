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

async function createParty() {
  return $fetch('/api/parties', {
    method: 'POST',
    body: { masterNickname: 'Master' }
  }) as Promise<{ seed: string }>
}

describe('POST /api/parties/:seed/join', () => {
  it('unisce un nuovo player', async () => {
    const { seed } = await createParty()
    const r = await $fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    }) as Record<string, unknown>
    expect(typeof r.sessionToken).toBe('string')
    const me = (r.initialState as { me: { nickname: string, role: string } }).me
    expect(me.nickname).toBe('Anna')
    expect(me.role).toBe('user')
  })

  it('rifiuta party inesistente con 404', async () => {
    await expect($fetch('/api/parties/00000000-0000-0000-0000-000000000000/join', {
      method: 'POST',
      body: { nickname: 'Anna' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })

  it('rifiuta nickname conflittuale con 409', async () => {
    const { seed } = await createParty()
    await $fetch(`/api/parties/${seed}/join`, { method: 'POST', body: { nickname: 'Anna' } })
    await expect($fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'conflict' })
  })
})
