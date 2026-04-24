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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admev-'))
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
  return `10.133.0.${ipCounter % 250}`
}

function uniqueUsername(prefix = 'ev'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
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
  if (res.status !== 200) throw new Error(`login ${res.status}`)
  const m = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!m) throw new Error('no cookie')
  return m[1]!
}

beforeAll(async () => {
  await seedDefaultAdmin()
})

describe('GET /api/admin/auth-events', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/auth-events')
    expect(res.status).toBe(401)
  })

  it('con superadmin → array di eventi già loggati (register + login)', async () => {
    // Genera eventi: una register + una login sul default admin (già fatto).
    const u = uniqueUsername('e')
    await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
      body: JSON.stringify({ username: u, password: 'secret12' })
    })

    const cookie = await adminCookie()
    const res = await fetch('/api/admin/auth-events', {
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(res.status).toBe(200)
    const rows = await res.json() as Array<{ event: string, usernameAttempted: string | null }>
    expect(Array.isArray(rows)).toBe(true)
    expect(rows.length).toBeGreaterThan(0)
    // Deve esistere almeno un evento register per l'username appena creato
    expect(rows.some(r => r.event === 'register' && r.usernameAttempted === u)).toBe(true)
    // E almeno un evento login (per l'admin)
    expect(rows.some(r => r.event === 'login')).toBe(true)
  })

  it('rispetta il parametro ?limit=', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/auth-events?limit=1', {
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(res.status).toBe(200)
    const rows = await res.json() as unknown[]
    expect(rows.length).toBe(1)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
