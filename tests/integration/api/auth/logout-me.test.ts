import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))

const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-logout-'))
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

function uniqueUsername(prefix = 'lm'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
}

let ipCounter = 0
function freshIp(): string {
  ipCounter += 1
  return `10.88.0.${ipCounter % 250}`
}

function approveUserByName(username: string): void {
  const db = new Database(dbPath)
  try {
    db.prepare(
      'UPDATE users SET status = ?, approved_at = ?, approved_by = ? WHERE username_lower = ?'
    ).run('approved', Date.now(), 'test-sa', username.toLowerCase())
  } finally {
    db.close()
  }
}

async function registerApproveLogin(username: string, password: string): Promise<string> {
  const regRes = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (regRes.status !== 202) throw new Error(`register failed: ${regRes.status}`)
  approveUserByName(username)
  const logRes = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (logRes.status !== 200) throw new Error(`login failed: ${logRes.status}`)
  const setCookie = logRes.headers.get('set-cookie') ?? ''
  const match = setCookie.match(/gdr_session=([^;]+)/)
  if (!match) throw new Error('no session cookie')
  return match[1]!
}

function countSessions(token: string): number {
  const db = new Database(dbPath)
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM sessions WHERE token = ?').get(token) as { c: number }
    return row.c
  } finally {
    db.close()
  }
}

describe('POST /api/auth/logout', () => {
  it('senza cookie → 204 (idempotente)', async () => {
    const res = await fetch('/api/auth/logout', { method: 'POST' })
    expect(res.status).toBe(204)
  })

  it('con cookie valido → 204 e sessione revocata in DB', async () => {
    const username = uniqueUsername('logout')
    const token = await registerApproveLogin(username, 'secret12')
    expect(countSessions(token)).toBe(1)

    const res = await fetch('/api/auth/logout', {
      method: 'POST',
      headers: { cookie: `gdr_session=${token}` }
    })
    expect(res.status).toBe(204)
    expect(countSessions(token)).toBe(0)
  })
})

describe('GET /api/auth/me', () => {
  it('senza cookie → 401 session_expired', async () => {
    const res = await fetch('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('con cookie valido user → 200 kind=user e campi', async () => {
    const username = uniqueUsername('me')
    const token = await registerApproveLogin(username, 'secret12')
    const res = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${token}` }
    })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.kind).toBe('user')
    expect(body.username).toBe(username)
    expect(body.mustReset).toBe(false)
    expect(typeof body.id).toBe('string')
  })

  it('con sessione scaduta (expires_at < now) → 401', async () => {
    const username = uniqueUsername('expired')
    const token = await registerApproveLogin(username, 'secret12')
    // Forza expires_at nel passato
    const db = new Database(dbPath)
    try {
      db.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?').run(1, token)
    } finally {
      db.close()
    }
    const res = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${token}` }
    })
    expect(res.status).toBe(401)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
