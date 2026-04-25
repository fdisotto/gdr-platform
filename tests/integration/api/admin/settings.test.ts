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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admset-'))
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

describe('GET /api/admin/settings', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/settings')
    expect(res.status).toBe(401)
  })

  it('ritorna mappa con default seedati', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/settings', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, { value: unknown }>
    expect(body['limits.maxPartiesPerUser']?.value).toBe(5)
    expect(body['features.registrationEnabled']?.value).toBe(true)
  })
})

describe('POST /api/admin/settings/[key]', () => {
  it('set valido aggiorna valore + audit log', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/settings/limits.maxPartiesPerUser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ value: 7 })
    })
    expect(res.status).toBe(200)
    const get = await fetch('/api/admin/settings', { headers: { cookie: `gdr_session=${cookie}` } })
    const body = await get.json() as Record<string, { value: unknown }>
    expect(body['limits.maxPartiesPerUser']?.value).toBe(7)
  })

  it('chiave sconosciuta → 400 setting_invalid', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/settings/unknown.key', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ value: 1 })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('setting_invalid')
  })

  it('valore di tipo errato → 400 setting_invalid', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/settings/features.registrationEnabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ value: 'yes' })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('setting_invalid')
  })

  it('range fuori → 400 setting_invalid', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/settings/limits.maxPartiesPerUser', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ value: 0 })
    })
    expect(res.status).toBe(400)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
