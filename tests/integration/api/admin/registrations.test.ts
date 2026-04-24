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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-reg-'))
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
  return `10.111.0.${ipCounter % 250}`
}

function uniqueUsername(prefix = 'r'): string {
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

async function adminLoginCookie(): Promise<string> {
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

async function registerUser(username: string, password = 'secret12'): Promise<string> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (res.status !== 202) throw new Error(`register failed ${res.status}`)
  const db = openDb()
  try {
    const row = db.prepare('SELECT id FROM users WHERE username_lower = ?')
      .get(username.toLowerCase()) as { id: string }
    return row.id
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  await seedDefaultAdmin()
})

describe('GET /api/admin/registrations', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/registrations')
    expect(res.status).toBe(401)
  })

  it('con admin → elenco pending di default', async () => {
    const cookie = await adminLoginCookie()
    const u = uniqueUsername('p')
    await registerUser(u)
    const res = await fetch('/api/admin/registrations', {
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(res.status).toBe(200)
    const list = await res.json() as Array<{ username: string, status: string, passwordHash?: unknown }>
    const mine = list.find(x => x.username === u)
    expect(mine).toBeTruthy()
    expect(mine!.status).toBe('pending')
    // passwordHash NON deve mai essere esposto
    expect(mine).not.toHaveProperty('passwordHash')
  })

  it('filtra per status=approved', async () => {
    const cookie = await adminLoginCookie()
    const u = uniqueUsername('a')
    const id = await registerUser(u)
    // Approvalo
    const app = await fetch(`/api/admin/registrations/${id}/approve`, {
      method: 'POST',
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(app.status).toBe(200)
    const res = await fetch('/api/admin/registrations?status=approved', {
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(res.status).toBe(200)
    const list = await res.json() as Array<{ username: string, status: string }>
    expect(list.some(x => x.username === u && x.status === 'approved')).toBe(true)
  })
})

describe('POST /api/admin/registrations/:id/approve', () => {
  it('flusso completo: register → approve → login ok', async () => {
    const cookie = await adminLoginCookie()
    const u = uniqueUsername('ap')
    const id = await registerUser(u, 'secret12')

    const app = await fetch(`/api/admin/registrations/${id}/approve`, {
      method: 'POST',
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(app.status).toBe(200)

    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u, password: 'secret12' })
    })
    expect(login.status).toBe(200)
  })

  it('id inesistente → 404', async () => {
    const cookie = await adminLoginCookie()
    const res = await fetch(
      '/api/admin/registrations/00000000-0000-0000-0000-000000000000/approve',
      {
        method: 'POST',
        headers: { cookie: `gdr_session=${cookie}` }
      }
    )
    expect(res.status).toBe(404)
  })
})

describe('POST /api/admin/registrations/:id/reject', () => {
  it('reject su pending elimina la row', async () => {
    const cookie = await adminLoginCookie()
    const u = uniqueUsername('rj')
    const id = await registerUser(u)

    const res = await fetch(`/api/admin/registrations/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ reason: 'spam' })
    })
    expect(res.status).toBe(200)

    const db = openDb()
    try {
      const row = db.prepare('SELECT id FROM users WHERE id = ?').get(id)
      expect(row).toBeUndefined()
    } finally {
      db.close()
    }
  })

  it('reject su approved NON elimina (no-op idempotente)', async () => {
    const cookie = await adminLoginCookie()
    const u = uniqueUsername('rja')
    const id = await registerUser(u)

    // Approvalo prima
    const app = await fetch(`/api/admin/registrations/${id}/approve`, {
      method: 'POST',
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(app.status).toBe(200)

    const res = await fetch(`/api/admin/registrations/${id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(200)

    const db = openDb()
    try {
      const row = db.prepare('SELECT status FROM users WHERE id = ?').get(id) as { status: string } | undefined
      expect(row).toBeTruthy()
      expect(row!.status).toBe('approved')
    } finally {
      db.close()
    }
  })
})

describe('must_reset lock sugli endpoint admin', () => {
  it('superadmin con mustReset=true → 403 must_reset_first sui registrations', async () => {
    // Imposta mustReset=true sull'admin seedato
    const db = openDb()
    try {
      db.prepare('UPDATE superadmins SET must_reset = 1 WHERE username_lower = ?').run('admin')
    } finally {
      db.close()
    }
    const cookie = await adminLoginCookie()
    const res = await fetch('/api/admin/registrations', {
      headers: { cookie: `gdr_session=${cookie}` }
    })
    expect(res.status).toBe(403)
    // Ripristina
    const db2 = openDb()
    try {
      db2.prepare('UPDATE superadmins SET must_reset = 0 WHERE username_lower = ?').run('admin')
    } finally {
      db2.close()
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
