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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admadmins-'))
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
  return `10.166.0.${ipCounter % 250}`
}
function uniqueUsername(prefix = 'a'): string {
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
  if (res.status !== 200) throw new Error(`admin login failed ${res.status}`)
  const m = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!m) throw new Error('no cookie')
  return m[1]!
}

async function registerApprove(admin: string, username: string, password = 'secret12'): Promise<string> {
  const reg = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (reg.status !== 202) throw new Error(`register ${reg.status}`)
  const db = openDb()
  let id: string
  try {
    const row = db.prepare('SELECT id FROM users WHERE username_lower = ?')
      .get(username.toLowerCase()) as { id: string }
    id = row.id
  } finally {
    db.close()
  }
  const app = await fetch(`/api/admin/registrations/${id}/approve`, {
    method: 'POST',
    headers: { cookie: `gdr_session=${admin}` }
  })
  if (app.status !== 200) throw new Error(`approve ${app.status}`)
  return id
}

beforeAll(async () => {
  await seedDefaultAdmin()
})

describe('admin admins endpoints', () => {
  it('senza auth GET → 401', async () => {
    const res = await fetch('/api/admin/admins')
    expect(res.status).toBe(401)
  })

  it('GET ritorna list inclusi revocati', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/admins', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const body = await res.json() as Array<{ username: string, isRevoked: boolean }>
    expect(body.find(r => r.username === 'admin')).toBeDefined()
  })

  it('elevate user → user può loggare /admin/login con credenziali', async () => {
    const admin = await adminCookie()
    const u = uniqueUsername('elev')
    const userId = await registerApprove(admin, u, 'secret12')

    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ targetUserId: userId })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean, superadminId: string, username: string }
    expect(body.ok).toBe(true)

    // Login admin con username del user e password originale
    const login = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: body.username, password: 'secret12' })
    })
    expect(login.status).toBe(200)
  })

  it('elevate su user non-approved → 400', async () => {
    const admin = await adminCookie()
    const u = uniqueUsername('pen')
    // Solo register (no approve)
    const reg = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
      body: JSON.stringify({ username: u, password: 'secret12' })
    })
    expect(reg.status).toBe(202)
    const db = openDb()
    let id: string
    try {
      id = (db.prepare('SELECT id FROM users WHERE username_lower = ?').get(u.toLowerCase()) as { id: string }).id
    } finally {
      db.close()
    }
    const res = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ targetUserId: id })
    })
    expect(res.status).toBe(400)
  })

  it('revoke nuovo admin → suo cookie non funziona più', async () => {
    const admin = await adminCookie()
    const u = uniqueUsername('rev')
    const userId = await registerApprove(admin, u, 'secret12')

    const elev = await fetch('/api/admin/admins', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ targetUserId: userId })
    })
    expect(elev.status).toBe(200)
    const eb = await elev.json() as { superadminId: string, username: string }

    // Login del nuovo admin
    const newLogin = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: eb.username, password: 'secret12' })
    })
    expect(newLogin.status).toBe(200)
    const newCookie = (newLogin.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)![1]!

    // Revoca
    const rv = await fetch(`/api/admin/admins/${eb.superadminId}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ reason: 'test' })
    })
    expect(rv.status).toBe(200)

    // Vecchio cookie invalidato
    const me = await fetch('/api/auth/me', { headers: { cookie: `gdr_session=${newCookie}` } })
    expect(me.status).toBe(401)
  })

  it('revoke ultimo admin attivo → 409 last_admin', async () => {
    const admin = await adminCookie()
    // Identifichiamo l'admin id self
    const list = await fetch('/api/admin/admins', { headers: { cookie: `gdr_session=${admin}` } })
    const arr = await list.json() as Array<{ id: string, username: string, isRevoked: boolean }>
    const active = arr.filter(r => !r.isRevoked)
    // Stato post-elevate-revoke nei test precedenti: ne resta almeno 1 attivo (admin).
    // Se ce n'è più di 1, revoke gli altri attivi finchè rimane solo "admin".
    for (const a of active) {
      if (a.username === 'admin') continue
      await fetch(`/api/admin/admins/${a.id}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
        body: JSON.stringify({})
      })
    }
    const adminRow = active.find(a => a.username === 'admin')!
    const res = await fetch(`/api/admin/admins/${adminRow.id}/revoke`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { data?: { code?: string }, statusMessage?: string }
    expect(body.statusMessage ?? body.data?.code).toBe('last_admin')
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
