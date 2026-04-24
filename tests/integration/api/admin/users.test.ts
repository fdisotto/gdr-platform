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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admusers-'))
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
  return `10.122.0.${ipCounter % 250}`
}

function uniqueUsername(prefix = 'au'): string {
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

async function userCookie(username: string, password: string): Promise<string> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (res.status !== 200) throw new Error(`user login failed ${res.status}`)
  const m = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!m) throw new Error('no cookie')
  return m[1]!
}

async function registerApprove(admin: string, username: string, password: string): Promise<string> {
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

describe('POST /api/admin/users/:id/ban', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/users/anything/ban', { method: 'POST' })
    expect(res.status).toBe(401)
  })

  it('ban su utente loggato: sessione revocata e login successivo 403', async () => {
    const admin = await adminCookie()
    const u = uniqueUsername('ban')
    const id = await registerApprove(admin, u, 'secret12')
    const uCookie = await userCookie(u, 'secret12')

    // Pre-check: /me funziona
    const pre = await fetch('/api/auth/me', { headers: { cookie: `gdr_session=${uCookie}` } })
    expect(pre.status).toBe(200)

    // Ban
    const ban = await fetch(`/api/admin/users/${id}/ban`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({ reason: 'spam' })
    })
    expect(ban.status).toBe(200)

    // Cookie ora invalido
    const post = await fetch('/api/auth/me', { headers: { cookie: `gdr_session=${uCookie}` } })
    expect(post.status).toBe(401)

    // Login successivo bloccato 403
    const relogin = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u, password: 'secret12' })
    })
    expect(relogin.status).toBe(403)
  })

  it('ban su utente inesistente → 404', async () => {
    const admin = await adminCookie()
    const res = await fetch('/api/admin/users/00000000-0000-0000-0000-000000000000/ban', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${admin}` },
      body: JSON.stringify({})
    })
    expect(res.status).toBe(404)
  })
})

describe('POST /api/admin/users/:id/reset-password', () => {
  it('ritorna tempPassword; utente può loggare e /me mostra mustReset=true', async () => {
    const admin = await adminCookie()
    const u = uniqueUsername('rst')
    const id = await registerApprove(admin, u, 'secret12')

    // Login pre-reset per avere una sessione da invalidare
    const oldCookie = await userCookie(u, 'secret12')

    const reset = await fetch(`/api/admin/users/${id}/reset-password`, {
      method: 'POST',
      headers: { cookie: `gdr_session=${admin}` }
    })
    expect(reset.status).toBe(200)
    const body = await reset.json() as { tempPassword: string }
    expect(body.tempPassword).toBeTruthy()
    expect(body.tempPassword.length).toBeGreaterThanOrEqual(8)

    // Vecchia sessione invalidata
    const oldMe = await fetch('/api/auth/me', { headers: { cookie: `gdr_session=${oldCookie}` } })
    expect(oldMe.status).toBe(401)

    // Login con password vecchia non funziona più
    const wrong = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u, password: 'secret12' })
    })
    expect(wrong.status).toBe(401)

    // Login con temp password ok, body mustReset:true
    const login = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: u, password: body.tempPassword })
    })
    expect(login.status).toBe(200)
    const lBody = await login.json()
    expect(lBody.mustReset).toBe(true)

    // /me mostra mustReset
    const newCookie = (login.headers.get('set-cookie') ?? '')
      .match(/gdr_session=([^;]+)/)?.[1]
    expect(newCookie).toBeTruthy()
    const me = await fetch('/api/auth/me', { headers: { cookie: `gdr_session=${newCookie}` } })
    expect(me.status).toBe(200)
    const meBody = await me.json()
    expect(meBody.mustReset).toBe(true)

    // Change password azzera mustReset
    const ch = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${newCookie}` },
      body: JSON.stringify({
        currentPassword: body.tempPassword,
        newPassword: 'newsecret12'
      })
    })
    expect(ch.status).toBe(200)
  })

  it('reset-password su utente inesistente → 404', async () => {
    const admin = await adminCookie()
    const res = await fetch('/api/admin/users/00000000-0000-0000-0000-000000000000/reset-password', {
      method: 'POST',
      headers: { cookie: `gdr_session=${admin}` }
    })
    expect(res.status).toBe(404)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
