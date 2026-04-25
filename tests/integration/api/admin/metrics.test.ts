import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admmet-'))
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

function openDb(): Database.Database {
  return new Database(dbPath)
}

async function seedDefaultAdmin(): Promise<void> {
  await fetch('/api/auth/me').catch(() => undefined)
  const db = openDb()
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM superadmins').get() as { c: number }
    if (row.c > 0) return
    const hash = await bcrypt.hash('changeme', 10)
    db.prepare(
      'INSERT INTO superadmins (id, username, username_lower, password_hash, must_reset, created_at) VALUES (?, ?, ?, ?, 0, ?)'
    ).run(randomUUID(), 'admin', 'admin', hash, Date.now())
  } finally {
    db.close()
  }
}

async function adminCookie(): Promise<string> {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'admin', password: 'changeme' })
  })
  if (res.status !== 200) throw new Error(`admin login failed ${res.status}`)
  const m = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!m) throw new Error('no cookie')
  return m[1]!
}

beforeAll(async () => {
  await seedDefaultAdmin()
})

describe('GET /api/admin/metrics/counters', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/metrics/counters')
    expect(res.status).toBe(401)
  })

  it('shape risposta corretta', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/metrics/counters', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const body = await res.json() as {
      users: { total: number, pending: number, approved: number, banned: number }
      parties: { total: number, active: number, archived: number, byVisibility: { public: number, private: number } }
      messages: { total: number, last24h: number }
      zombies: { total: number, npcs: number }
      sessions: { active: number, expiredLast24h: number }
      wsConnections: { current: number }
      serverTime: number
    }
    expect(body.users).toBeDefined()
    expect(body.parties.byVisibility).toBeDefined()
    expect(typeof body.serverTime).toBe('number')
  })
})

describe('GET /api/admin/metrics/timeseries', () => {
  it('default 30d ritorna shape coerente', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/metrics/timeseries', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const body = await res.json() as { from: string, to: string, items: Array<{ date: string }> }
    expect(body.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(body.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(Array.isArray(body.items)).toBe(true)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
