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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-parties-browser-'))
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

interface BrowserItem {
  seed: string
  cityName: string
  visibility: string
  joinPolicy: string
  memberCount: number
  masterDisplays: string[]
  isMember: boolean
  hasPendingRequest: boolean
}

async function createPartyApi(cookie: string, displayName: string): Promise<{ seed: string }> {
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  return await res.json() as { seed: string }
}

async function browse(cookie: string, qs = ''): Promise<{ items: BrowserItem[], nextCursor: string | null }> {
  const res = await fetch(`/api/parties${qs ? `?${qs}` : ''}`, {
    method: 'GET',
    headers: { cookie }
  })
  if (res.status !== 200) throw new Error(`browse failed ${res.status}`)
  return await res.json() as { items: BrowserItem[], nextCursor: string | null }
}

describe('GET /api/parties (browser)', () => {
  it('rifiuta senza cookie auth con 401', async () => {
    const res = await fetch('/api/parties')
    expect(res.status).toBe(401)
  })

  it('mine=1 ritorna le party del chiamante', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const r = await createPartyApi(a.cookie, 'Master')
    const page = await browse(a.cookie, 'mine=1')
    expect(page.items.map(i => i.seed)).toContain(r.seed)
    const item = page.items.find(i => i.seed === r.seed)!
    expect(item.isMember).toBe(true)
    expect(item.masterDisplays).toContain('Master')
    expect(item.memberCount).toBe(1)
  })

  it('default (no mine) nasconde private ai non-membri', async () => {
    // I default attuali dell endpoint POST creano private+request,
    // quindi dovrebbero essere invisibili a un altro user.
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const r = await createPartyApi(a.cookie, 'Master')
    const page = await browse(b.cookie)
    expect(page.items.map(i => i.seed)).not.toContain(r.seed)
  })

  it('limit + cursor coprono pagine multiple', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    await createPartyApi(a.cookie, 'M1')
    await createPartyApi(a.cookie, 'M2')
    await createPartyApi(a.cookie, 'M3')
    const p1 = await browse(a.cookie, 'mine=1&limit=2')
    expect(p1.items).toHaveLength(2)
    if (p1.nextCursor) {
      const p2 = await browse(a.cookie, `mine=1&limit=2&cursor=${encodeURIComponent(p1.nextCursor)}`)
      expect(p2.items.length).toBeGreaterThanOrEqual(1)
    }
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
