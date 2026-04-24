import { describe, it, expect } from 'vitest'
import { setup, $fetch, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))

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

function uniqueUsername(prefix = 'reg'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
}

describe('POST /api/auth/register', () => {
  it('ritorna 202 + pending su input valido', async () => {
    const username = uniqueUsername()
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret12' })
    })
    expect(res.status).toBe(202)
    const json = await res.json()
    expect(json).toMatchObject({ status: 'pending' })
  })

  it('rifiuta duplicate username case-insensitive con 409', async () => {
    const username = uniqueUsername('dup')
    await $fetch('/api/auth/register', {
      method: 'POST',
      body: { username, password: 'secret12' }
    })
    await expect($fetch('/api/auth/register', {
      method: 'POST',
      body: { username: username.toUpperCase(), password: 'secret12' }
    })).rejects.toMatchObject({ statusCode: 409, statusMessage: 'username_taken' })
  })

  it('rifiuta password corta con 400', async () => {
    await expect($fetch('/api/auth/register', {
      method: 'POST',
      body: { username: uniqueUsername('pw'), password: 'short' }
    })).rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_payload' })
  })

  it('rifiuta username con spazi con 400', async () => {
    await expect($fetch('/api/auth/register', {
      method: 'POST',
      body: { username: 'bad user', password: 'secret12' }
    })).rejects.toMatchObject({ statusCode: 400, statusMessage: 'invalid_payload' })
  })

  it('applica rate limit (3/h per ip): 4° tentativo → 429', async () => {
    // Il limiter è process-wide; usiamo un header x-forwarded-for univoco
    // per isolare il bucket di questo test dagli altri.
    const ip = '10.200.0.42'
    for (let i = 0; i < 3; i++) {
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ username: uniqueUsername(`rl${i}`), password: 'secret12' })
      })
      expect(r.status).toBe(202)
    }
    const r4 = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ username: uniqueUsername('rl4'), password: 'secret12' })
    })
    expect(r4.status).toBe(429)
  })
})
