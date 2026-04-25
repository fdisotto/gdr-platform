import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync, existsSync } from 'node:fs'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  registerApproveLogin, uniqueUsername
} from '../../helpers/e2e-auth'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-maps-'))
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

interface UserInfo { id: string }

async function meId(cookie: string): Promise<string> {
  const res = await fetch('/api/auth/me', { headers: { cookie } })
  const j = await res.json() as UserInfo
  return j.id
}

async function createParty(cookie: string, displayName: string): Promise<string> {
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, visibility: 'public', joinPolicy: 'auto' })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  const body = await res.json() as { seed: string }
  return body.seed
}

async function joinPartyApi(cookie: string, seed: string, displayName: string): Promise<void> {
  const res = await fetch(`/api/parties/${seed}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName })
  })
  if (res.status !== 200) throw new Error(`join failed ${res.status}`)
}

interface PartyMapResponse {
  id: string
  partySeed: string
  mapTypeId: string
  mapSeed: string
  name: string
  isSpawn: boolean
  createdAt: number
  memberCount: number
  zombieCount: number
}

describe('GET /api/parties/:seed/maps', () => {
  it('senza cookie → 401', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/maps`)
    expect(res.status).toBe(401)
  })

  it('user non-master → 403 master_only', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/maps`, {
      headers: { cookie: b.cookie }
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('master_only')
  })

  it('master su party senza mappe → 200, body []', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/maps`, {
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as PartyMapResponse[]
    expect(Array.isArray(body)).toBe(true)
    expect(body).toEqual([])
  })
})

describe('POST /api/parties/:seed/maps', () => {
  it('master crea mappa e la riceve in lista', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const create = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ mapTypeId: 'city', name: 'Centro', isSpawn: true })
    })
    expect(create.status).toBe(200)
    const created = await create.json() as PartyMapResponse
    expect(created.id).toMatch(/[0-9a-f-]{36}/)
    expect(created.partySeed).toBe(seed)
    expect(created.mapTypeId).toBe('city')
    expect(created.name).toBe('Centro')
    expect(created.isSpawn).toBe(true)
    expect(created.memberCount).toBe(0)
    expect(created.zombieCount).toBe(0)

    const list = await fetch(`/api/parties/${seed}/maps`, {
      headers: { cookie: a.cookie }
    })
    expect(list.status).toBe(200)
    const rows = await list.json() as PartyMapResponse[]
    expect(rows.length).toBe(1)
    expect(rows[0]!.id).toBe(created.id)
    expect(rows[0]!.memberCount).toBe(0)
    expect(rows[0]!.zombieCount).toBe(0)
  })

  it('mapTypeId inesistente → 404 map_type_not_found', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ mapTypeId: 'no-such-type', name: 'X' })
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { statusMessage?: string, data?: { code?: string } }
    expect(body.statusMessage ?? body.data?.code).toBe('map_type_not_found')
  })

  it('mapTypeId disabled → 404 map_type_not_found', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    // Disabilito wasteland direttamente nel DB per simulare un map_type
    // con enabled=false senza dipendere dall'endpoint admin.
    if (!existsSync(dbPath)) throw new Error('dbPath missing')
    const db = new Database(dbPath)
    try {
      db.prepare('UPDATE map_types SET enabled = 0 WHERE id = ?').run('wasteland')
    } finally {
      db.close()
    }
    const res = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ mapTypeId: 'wasteland', name: 'Bad' })
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('map_type_not_found')
    // Ripristino per non sporcare i test successivi
    const db2 = new Database(dbPath)
    try {
      db2.prepare('UPDATE map_types SET enabled = 1 WHERE id = ?').run('wasteland')
    } finally {
      db2.close()
    }
  })

  it('body invalido (name vuoto) → 400 invalid_payload', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ mapTypeId: 'city', name: '' })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('invalid_payload')
  })

  it('oltre il limite (10 mappe) → 429 map_limit', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    // Pre-popolo direttamente via DB con 10 mappe per saturare il limite
    // senza dipendere dall'endpoint POST stesso.
    const db = new Database(dbPath)
    try {
      const insert = db.prepare(
        'INSERT INTO party_maps (id, party_seed, map_type_id, map_seed, name, is_spawn, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)'
      )
      for (let i = 0; i < 10; i++) {
        insert.run(randomUUID(), seed, 'city', `seed-${i}`, `M${i}`, Date.now() + i)
      }
    } finally {
      db.close()
    }
    const res = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ mapTypeId: 'city', name: 'Overflow' })
    })
    expect(res.status).toBe(429)
    const body = await res.json() as { statusMessage?: string, data?: { code?: string } }
    expect(body.statusMessage ?? body.data?.code).toBe('map_limit')
  })

  it('non-master crea → 403 master_only', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ mapTypeId: 'city', name: 'Hacker' })
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('master_only')
  })

  it('audit log master_actions registra row con action=map.create', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const masterUserId = await meId(a.cookie)
    const create = await fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ mapTypeId: 'country', name: 'Distretto' })
    })
    expect(create.status).toBe(200)
    const created = await create.json() as PartyMapResponse

    const db = new Database(dbPath)
    try {
      const row = db.prepare(
        'SELECT action, target, master_id, payload FROM master_actions WHERE party_seed = ? AND action = ? ORDER BY created_at DESC LIMIT 1'
      ).get(seed, 'map.create') as
        { action: string, target: string, master_id: string, payload: string } | undefined
      expect(row).toBeDefined()
      expect(row!.action).toBe('map.create')
      expect(row!.target).toBe(created.id)
      expect(row!.master_id).toBe(masterUserId)
      const payload = JSON.parse(row!.payload) as Record<string, unknown>
      expect(payload.mapTypeId).toBe('country')
      expect(payload.name).toBe('Distretto')
    } finally {
      db.close()
    }
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
