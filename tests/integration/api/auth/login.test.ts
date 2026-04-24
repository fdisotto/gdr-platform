import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))

// Usiamo un DB file condiviso fra processo test e server Nitro per poter
// leggere/scrivere direttamente dallo stesso DB (manipolare status utenti
// senza passare da endpoint admin non ancora implementati).
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-login-'))
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

function uniqueUsername(prefix = 'log'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
}

let ipCounter = 100
function freshIp(): string {
  ipCounter += 1
  return `10.77.0.${ipCounter % 250}`
}

function openDb(): Database.Database {
  return new Database(dbPath)
}

function approveUserByName(username: string): void {
  const db = openDb()
  try {
    db.prepare(
      'UPDATE users SET status = ?, approved_at = ?, approved_by = ? WHERE username_lower = ?'
    ).run('approved', Date.now(), 'test-sa', username.toLowerCase())
  } finally {
    db.close()
  }
}

function banUserByName(username: string, reason: string): void {
  const db = openDb()
  try {
    db.prepare(
      'UPDATE users SET status = ?, banned_reason = ? WHERE username_lower = ?'
    ).run('banned', reason, username.toLowerCase())
  } finally {
    db.close()
  }
}

function setMustResetByName(username: string, value: boolean): void {
  const db = openDb()
  try {
    db.prepare('UPDATE users SET must_reset = ? WHERE username_lower = ?')
      .run(value ? 1 : 0, username.toLowerCase())
  } finally {
    db.close()
  }
}

async function registerUser(username: string, password: string): Promise<void> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (res.status !== 202) {
    throw new Error(`register failed: ${res.status}`)
  }
}

async function registerAndApprove(username: string, password: string): Promise<void> {
  await registerUser(username, password)
  approveUserByName(username)
}

describe('POST /api/auth/login', () => {
  it('credenziali valide + approved → 200 con mustReset:false e cookie', async () => {
    const username = uniqueUsername()
    await registerAndApprove(username, 'secret12')

    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret12' })
    })
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('gdr_session=')
    expect(setCookie.toLowerCase()).toContain('httponly')
    const body = await res.json()
    expect(body).toMatchObject({ mustReset: false })
  })

  it('password errata → 401 e nessun cookie', async () => {
    const username = uniqueUsername('wrong')
    await registerAndApprove(username, 'secret12')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'badpass!!' })
    })
    expect(res.status).toBe(401)
    expect(res.headers.get('set-cookie') ?? '').not.toContain('gdr_session=')
  })

  it('account pending → 403', async () => {
    const username = uniqueUsername('pend')
    await registerUser(username, 'secret12')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret12' })
    })
    expect(res.status).toBe(403)
  })

  it('account banned → 403', async () => {
    const username = uniqueUsername('ban')
    await registerAndApprove(username, 'secret12')
    banUserByName(username, 'test')
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret12' })
    })
    expect(res.status).toBe(403)
  })

  it('5 tentativi falliti → 6° → 429', async () => {
    const username = uniqueUsername('rl')
    await registerAndApprove(username, 'secret12')
    const ip = '10.200.0.50'
    for (let i = 0; i < 5; i++) {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ username, password: 'wrongpass' })
      })
      expect(r.status).toBe(401)
    }
    const r6 = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ username, password: 'wrongpass' })
    })
    expect(r6.status).toBe(429)
  })

  it('success azzera il contatore rate-limit', async () => {
    const username = uniqueUsername('rst')
    await registerAndApprove(username, 'secret12')
    const ip = '10.200.0.51'
    for (let i = 0; i < 4; i++) {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ username, password: 'wrongpass' })
      })
      expect(r.status).toBe(401)
    }
    const ok = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify({ username, password: 'secret12' })
    })
    expect(ok.status).toBe(200)
    for (let i = 0; i < 5; i++) {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
        body: JSON.stringify({ username, password: 'wrongpass' })
      })
      expect(r.status).toBe(401)
    }
  })

  it('user con mustReset=true → body mustReset:true', async () => {
    const username = uniqueUsername('mr')
    await registerAndApprove(username, 'secret12')
    setMustResetByName(username, true)
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: 'secret12' })
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mustReset).toBe(true)
  })
})

// Cleanup del DB temporaneo a fine file (vitest globalTeardown non necessario).
// NB: @nuxt/test-utils spegne il server al termine del file.
process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
