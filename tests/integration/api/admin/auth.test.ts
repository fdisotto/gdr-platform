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

const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admauth-'))
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

// Seed manuale del default superadmin — il plugin Nitro non lo fa, è lo script
// `pnpm db:migrate` a chiamare seed-superadmin.ts. In test seminiamo via SQL.
async function seedDefaultAdmin(): Promise<void> {
  // Primo ping al server per triggerare la creazione del DB con le migration.
  await fetch('/api/auth/me').catch(() => undefined)
  const db = new Database(dbPath)
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM superadmins').get() as { c: number }
    if (row.c > 0) return
    const hash = await bcrypt.hash('changeme', 10)
    db.prepare(
      'INSERT INTO superadmins (id, username, username_lower, password_hash, must_reset, created_at) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(randomUUID(), 'admin', 'admin', hash, Date.now())
  } finally {
    db.close()
  }
}

beforeAll(async () => {
  await seedDefaultAdmin()
})

async function adminLogin(username: string, password: string): Promise<Response> {
  return fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
}

function cookieFrom(res: Response): string {
  const m = (res.headers.get('set-cookie') ?? '').match(/gdr_session=([^;]+)/)
  if (!m) throw new Error('no session cookie')
  return m[1]!
}

function openDb(): Database.Database {
  return new Database(dbPath)
}

describe('POST /api/admin/login', () => {
  it('default admin/changeme → 200 con mustReset:true', async () => {
    const res = await adminLogin('admin', 'changeme')
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.mustReset).toBe(true)
    const setCookie = res.headers.get('set-cookie') ?? ''
    expect(setCookie).toContain('gdr_session=')
  })

  it('password errata → 401', async () => {
    const res = await adminLogin('admin', 'wrong')
    expect(res.status).toBe(401)
  })

  it('username inesistente → 401', async () => {
    const res = await adminLogin('nobody', 'changeme')
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/change-password (mustReset flow)', () => {
  it('accessibile con mustReset=true, azzera mustReset, revoca altre sessioni', async () => {
    // Primo login → token1 con mustReset:true
    const login1 = await adminLogin('admin', 'changeme')
    expect(login1.status).toBe(200)
    const token1 = cookieFrom(login1)

    // Secondo login → token2 (sessione aggiuntiva prima del cambio)
    const login2 = await adminLogin('admin', 'changeme')
    expect(login2.status).toBe(200)
    const token2 = cookieFrom(login2)

    // Cambio password con token1
    const chp = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${token1}` },
      body: JSON.stringify({ currentPassword: 'changeme', newPassword: 'newadmin12' })
    })
    expect(chp.status).toBe(200)
    const newToken = cookieFrom(chp)
    expect(newToken).not.toBe(token1)

    // Check DB: mustReset azzerato
    const db = openDb()
    try {
      const row = db.prepare('SELECT must_reset AS mr FROM superadmins WHERE username_lower = ?')
        .get('admin') as { mr: number }
      expect(row.mr).toBe(0)
    } finally {
      db.close()
    }

    // token1 e token2 ora invalidi: /api/auth/me ritorna 401
    const r1 = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${token1}` }
    })
    expect(r1.status).toBe(401)
    const r2 = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${token2}` }
    })
    expect(r2.status).toBe(401)

    // newToken valido e kind=superadmin
    const meNew = await fetch('/api/auth/me', {
      headers: { cookie: `gdr_session=${newToken}` }
    })
    expect(meNew.status).toBe(200)
    const meBody = await meNew.json()
    expect(meBody.kind).toBe('superadmin')
    expect(meBody.mustReset).toBe(false)

    // Login con nuova password funziona
    const ok = await adminLogin('admin', 'newadmin12')
    expect(ok.status).toBe(200)
  })

  it('rifiuta senza cookie → 401', async () => {
    const res = await fetch('/api/admin/change-password', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ currentPassword: 'x', newPassword: 'newadmin12' })
    })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/admin/logout', () => {
  it('senza cookie → 204', async () => {
    const res = await fetch('/api/admin/logout', { method: 'POST' })
    expect(res.status).toBe(204)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
