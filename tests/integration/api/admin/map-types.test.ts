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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admmt-'))
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

interface MapTypeBody {
  id: string
  name: string
  description: string
  defaultParams: string
  areaCountMin: number
  areaCountMax: number
  enabled: boolean
}

describe('GET /api/admin/map-types', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/map-types')
    expect(res.status).toBe(401)
  })

  it('ritorna lista con almeno 3 righe seedate', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/map-types', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const body = await res.json() as MapTypeBody[]
    const ids = body.map(r => r.id)
    expect(ids).toContain('city')
    expect(ids).toContain('country')
    expect(ids).toContain('wasteland')
    expect(body.length).toBeGreaterThanOrEqual(3)
  })
})

describe('POST /api/admin/map-types/[id]', () => {
  it('aggiorna enabled=false e GET successivo riflette il cambio', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/map-types/wasteland', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ enabled: false })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const get = await fetch('/api/admin/map-types', { headers: { cookie: `gdr_session=${cookie}` } })
    const all = await get.json() as MapTypeBody[]
    const w = all.find(r => r.id === 'wasteland')!
    expect(w.enabled).toBe(false)
  })

  it('id inesistente → 404', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/map-types/no-such-id', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ enabled: true })
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { statusMessage?: string, data?: { code?: string } }
    expect(body.statusMessage ?? body.data?.code).toBe('not_found')
  })

  it('areaCountMin > areaCountMax → 400 invalid_payload', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/map-types/city', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ areaCountMin: 5, areaCountMax: 3 })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('invalid_payload')
  })

  it('update registra admin_actions con action=map_type.update', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/map-types/country', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ areaCountMin: 7, areaCountMax: 11 })
    })
    expect(res.status).toBe(200)

    const db = openDb()
    try {
      const row = db.prepare(
        'SELECT action, target_kind, target_id FROM admin_actions WHERE action = \'map_type.update\' AND target_id = \'country\' ORDER BY created_at DESC LIMIT 1'
      ).get() as { action: string, target_kind: string, target_id: string } | undefined
      expect(row).toBeDefined()
      expect(row!.action).toBe('map_type.update')
      expect(row!.target_kind).toBe('map_type')
      expect(row!.target_id).toBe('country')
    } finally {
      db.close()
    }
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
