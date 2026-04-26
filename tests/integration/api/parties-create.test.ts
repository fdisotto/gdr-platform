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
    // T16: createParty non pre-popola più areasState con le 14 aree city
    // legacy. Le aree del GeneratedMap city vivono sulla spawn party_map
    // creata dal service; areasState contiene solo override del master.
    expect(initial.areasState).toHaveLength(0)
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

  it('accetta visibility=public e joinPolicy=auto', async () => {
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('c3'))
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        displayName: 'Pub', visibility: 'public', joinPolicy: 'auto'
      })
    })
    expect(res.status).toBe(200)
    const r = await res.json() as { seed: string }
    // verifichiamo via browser endpoint che la party sia visibile a un altro user
    const other = await registerApproveLogin(dbPath, uniqueUsername('c4'))
    const browseRes = await fetch('/api/parties', {
      headers: { cookie: other.cookie }
    })
    const page = await browseRes.json() as { items: { seed: string, visibility: string, joinPolicy: string }[] }
    const item = page.items.find(i => i.seed === r.seed)!
    expect(item.visibility).toBe('public')
    expect(item.joinPolicy).toBe('auto')
  })

  it('rifiuta visibility invalido', async () => {
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('c5'))
    const res = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'X', visibility: 'wrong' })
    })
    expect(res.status).toBe(400)
  })

  it('blocca al 6° create dello stesso utente con party_limit (429)', async () => {
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('c6'))
    for (let i = 0; i < 5; i++) {
      const res = await fetch('/api/parties', {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie },
        body: JSON.stringify({ displayName: `M${i}` })
      })
      expect(res.status).toBe(200)
    }
    const sixth = await fetch('/api/parties', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'M5' })
    })
    expect(sixth.status).toBe(429)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
