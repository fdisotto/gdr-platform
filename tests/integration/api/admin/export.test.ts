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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-admexp-'))
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
  return `10.144.0.${ipCounter % 250}`
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

beforeAll(async () => {
  await seedDefaultAdmin()
  // Crea almeno 1 user e 1 messaggio per non avere CSV vuoti
  const username = `exp${Math.random().toString(36).slice(2, 8)}`
  await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password: 'secret12' })
  })
})

describe('GET /api/admin/export', () => {
  it('senza auth → 401', async () => {
    const res = await fetch('/api/admin/export?kind=users')
    expect(res.status).toBe(401)
  })

  it('kind=users ritorna CSV ben formato', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/export?kind=users', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type') ?? '').toContain('text/csv')
    const text = await res.text()
    const lines = text.trim().split('\n')
    expect(lines[0]).toBe('id,username,status,createdAt,approvedAt,bannedReason')
    expect(lines.length).toBeGreaterThanOrEqual(1)
  })

  it('kind=parties ritorna CSV con header', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/export?kind=parties', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.split('\n')[0]).toBe('seed,cityName,visibility,joinPolicy,createdAt,archivedAt,memberCount,lastActivityAt')
  })

  it('kind=audit ritorna CSV con header', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/export?kind=audit', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.split('\n')[0]).toBe('source,createdAt,actor,action,targetKind,targetId,detail')
  })

  it('kind=messages ritorna CSV con header', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/export?kind=messages', { headers: { cookie: `gdr_session=${cookie}` } })
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text.split('\n')[0]).toBe('id,partySeed,kind,authorDisplay,areaId,body,createdAt')
  })

  it('kind invalido → 400', async () => {
    const cookie = await adminCookie()
    const res = await fetch('/api/admin/export?kind=foo', { headers: { cookie: `gdr_session=${cookie}` } })
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
