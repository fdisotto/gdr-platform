import { describe, it, expect } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))

await setup({
  rootDir,
  dev: false,
  server: true,
  env: { DATABASE_URL: ':memory:' }
})

describe('POST /api/parties/:seed/reclaim-master', () => {
  it('con token corretto rilascia una nuova session', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'Master' }
    }) as { seed: string, masterToken: string, sessionToken: string }

    const r = await $fetch(`/api/parties/${create.seed}/reclaim-master`, {
      method: 'POST',
      body: { masterToken: create.masterToken }
    }) as { sessionToken: string }

    expect(r.sessionToken.length).toBeGreaterThan(10)
    expect(r.sessionToken).not.toBe(create.sessionToken)
  })

  it('con token sbagliato → 403', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'Master' }
    }) as { seed: string }

    await expect($fetch(`/api/parties/${create.seed}/reclaim-master`, {
      method: 'POST',
      body: { masterToken: 'wrong' }
    })).rejects.toMatchObject({ statusCode: 403 })
  })

  it('party inesistente → 404', async () => {
    await expect($fetch('/api/parties/00000000-0000-0000-0000-000000000000/reclaim-master', {
      method: 'POST',
      body: { masterToken: 'wrong' }
    })).rejects.toMatchObject({ statusCode: 404 })
  })
})
