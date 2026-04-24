import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))

const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-chpw-'))
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

function uniqueUsername(prefix = 'cp'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
}

let ipCounter = 0
function freshIp(): string {
  ipCounter += 1
  return `10.99.0.${ipCounter % 250}`
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
  const match = (logRes.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!match) throw new Error('no session cookie')
  return match[1]!
}

async function extraLogin(username: string, password: string): Promise<string> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (res.status !== 200) throw new Error(`extra login failed: ${res.status}`)
  const match = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!match) throw new Error('no cookie on extra login')
  return match[1]!
}

describe('POST /api/auth/change-password', () => {
  it('senza cookie → 401', async () => {
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'secret12', newPassword: 'newsecret12' })
    })
    expect(res.status).toBe(401)
  })

  it('currentPassword errata → 401 invalid_credentials', async () => {
    const username = uniqueUsername('wr')
    const token = await registerApproveLogin(username, 'secret12')
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${token}` },
      body: JSON.stringify({ currentPassword: 'wrongpass', newPassword: 'newsecret12' })
    })
    expect(res.status).toBe(401)
  })

  it('newPassword uguale a current → 400 weak_password', async () => {
    const username = uniqueUsername('same')
    const token = await registerApproveLogin(username, 'secret12')
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${token}` },
      body: JSON.stringify({ currentPassword: 'secret12', newPassword: 'secret12' })
    })
    expect(res.status).toBe(400)
  })

  it('successo: 200, altre sessioni revocate, nuovo cookie emesso', async () => {
    const username = uniqueUsername('ok')
    const password = 'secret12'
    const current = await registerApproveLogin(username, password)
    const other = await extraLogin(username, password)

    // Pre-verifica: /me con la sessione "other" funziona
    const meBefore = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${other}` }
    })
    expect(meBefore.status).toBe(200)

    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${current}` },
      body: JSON.stringify({ currentPassword: password, newPassword: 'newsecret12' })
    })
    expect(res.status).toBe(200)
    const setCookie = res.headers.get('set-cookie') ?? ''
    const newMatch = setCookie.match(/gdr_session=([^;]+)/)
    expect(newMatch).toBeTruthy()
    const newToken = newMatch![1]!
    expect(newToken).not.toBe(current)

    // /me col nuovo cookie funziona
    const meNew = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${newToken}` }
    })
    expect(meNew.status).toBe(200)

    // /me con l'altra sessione è ora invalidato
    const meOther = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${other}` }
    })
    expect(meOther.status).toBe(401)

    // /me col vecchio cookie (current) è invalidato
    const meOld = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${current}` }
    })
    expect(meOld.status).toBe(401)
  })

  it('dopo cambio password mustReset=false (già era, verifica azzeramento)', async () => {
    const username = uniqueUsername('mr')
    const token = await registerApproveLogin(username, 'secret12')
    // Imposta mustReset=true manualmente
    const db = new Database(dbPath)
    try {
      db.prepare('UPDATE users SET must_reset = 1 WHERE username_lower = ?')
        .run(username.toLowerCase())
    } finally {
      db.close()
    }

    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${token}` },
      body: JSON.stringify({ currentPassword: 'secret12', newPassword: 'brandnew12' })
    })
    expect(res.status).toBe(200)

    const db2 = new Database(dbPath)
    try {
      const row = db2.prepare('SELECT must_reset AS mr FROM users WHERE username_lower = ?')
        .get(username.toLowerCase()) as { mr: number }
      expect(row.mr).toBe(0)
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
