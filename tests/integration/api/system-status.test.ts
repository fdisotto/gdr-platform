import { describe, it, expect, beforeAll } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import bcrypt from 'bcryptjs'
import { randomUUID } from 'node:crypto'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-sysstat-'))
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
})

describe('GET /api/system/status', () => {
  it('senza auth ritorna shape pubblica', async () => {
    const res = await fetch('/api/system/status')
    expect(res.status).toBe(200)
    const body = await res.json() as {
      maintenanceMode: boolean
      maintenanceMessage: string
      registrationEnabled: boolean
      partyCreationEnabled: boolean
      voiceChatEnabled: boolean
      serverTime: number
    }
    expect(body.maintenanceMode).toBe(false)
    expect(typeof body.maintenanceMessage).toBe('string')
    expect(body.registrationEnabled).toBe(true)
    expect(body.partyCreationEnabled).toBe(true)
    expect(body.voiceChatEnabled).toBe(true)
    expect(typeof body.serverTime).toBe('number')
  })

  it('riflette le impostazioni aggiornate', async () => {
    const cookie = await adminCookie()
    await fetch('/api/admin/settings/features.registrationEnabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': `gdr_session=${cookie}` },
      body: JSON.stringify({ value: false })
    })
    const res = await fetch('/api/system/status')
    const body = await res.json() as { registrationEnabled: boolean }
    expect(body.registrationEnabled).toBe(false)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch {
    // ignore
  }
})
