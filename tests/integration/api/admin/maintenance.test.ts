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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admmnt-'))
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

let ipCounter = 0
function freshIp(): string {
  ipCounter += 1
  return `10.99.0.${ipCounter % 250}`
}

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
  const m = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  return m![1]!
}

async function userCookie(admin: string): Promise<string> {
  const u = `mt${Math.random().toString(36).slice(2, 8)}`
  await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username: u, password: 'secret12' })
  })
  const db = openDb()
  let id: string
  try {
    id = (db.prepare('SELECT id FROM users WHERE username_lower = ?').get(u.toLowerCase()) as { id: string }).id
  } finally {
    db.close()
  }
  await fetch(`/api/admin/registrations/${id}/approve`, {
    method: 'POST',
    headers: { cookie: `gdr_session=${admin}` }
  })
  const login = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: u, password: 'secret12' })
  })
  const m = (login.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  return m![1]!
}

beforeAll(async () => {
  await seedDefaultAdmin()
})

describe('maintenance toggle + middleware guard', () => {
  it('toggle on/off via /api/admin/maintenance', async () => {
    const admin = await adminCookie()
    // Crea l'utente PRIMA di attivare il guard, così register e login passano
    const u = await userCookie(admin)

    const on = await fetch('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ enabled: true, message: 'Test in corso' })
    })
    expect(on.status).toBe(200)

    // Verifica setting
    const get = await fetch('/api/admin/settings', { headers: { cookie: `gdr_session=${admin}` } })
    const body = await get.json() as Record<string, { value: unknown }>
    expect(body['system.maintenanceMode']?.value).toBe(true)
    expect(body['system.maintenanceMessage']?.value).toBe('Test in corso')

    // GET /api/parties (non admin, non bypass) per utente normale → 503
    const block = await fetch('/api/parties', { headers: { cookie: `gdr_session=${u}` } })
    expect(block.status).toBe(503)

    // GET /api/admin/parties con admin → 200 (bypass)
    const adminGet = await fetch('/api/admin/parties', { headers: { cookie: `gdr_session=${admin}` } })
    expect(adminGet.status).toBe(200)

    // Toggle off
    const off = await fetch('/api/admin/maintenance', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ enabled: false })
    })
    expect(off.status).toBe(200)

    // Ora /api/parties torna ok per user
    const ok = await fetch('/api/parties', { headers: { cookie: `gdr_session=${u}` } })
    expect(ok.status).toBe(200)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
