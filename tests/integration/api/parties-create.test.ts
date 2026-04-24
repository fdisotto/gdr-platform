import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import {
  registerApproveLogin, uniqueUsername
} from '../helpers/e2e-auth'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-parties-create-'))
const dbPath = join(tmpDir, 'gdr.sqlite')

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
  env: { DATABASE_URL: dbPath }
})

describe('POST /api/parties', () => {
  it('crea una party con cookie auth e torna seed, masterToken, initialState', async () => {
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('c1'))
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Fab' })
    })
    expect(res.status).toBe(200)
    const r = await res.json() as Record<string, unknown>
    expect(typeof r.seed).toBe('string')
    expect(typeof r.masterToken).toBe('string')
    // v2a: sessionToken non è più in response (la sessione vive nel cookie)
    expect(r.sessionToken).toBeUndefined()
    const initial = r.initialState as { areasState: unknown[], players: unknown[] }
    expect(initial.areasState).toHaveLength(14)
    expect(initial.players).toHaveLength(1)
  })

  it('rifiuta senza cookie auth con 401', async () => {
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Fab' })
    })
    expect(res.status).toBe(401)
  })

  it('rifiuta body invalido con 400', async () => {
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('c2'))
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'a' })
    })
    expect(res.status).toBe(400)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
