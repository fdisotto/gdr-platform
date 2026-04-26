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

interface PartyMapDetailResponse extends PartyMapResponse {
  generatedMap: {
    areas: Array<{ id: string }>
    adjacency: Record<string, string[]>
    spawnAreaId: string
    edgeAreaIds: string[]
    background: Record<string, unknown>
  }
}

async function createMap(
  cookie: string, seed: string, body: { mapTypeId: string, name: string, isSpawn?: boolean }
): Promise<PartyMapResponse> {
  const res = await fetch(`/api/parties/${seed}/maps`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify(body)
  })
  if (res.status !== 200) throw new Error(`createMap failed ${res.status}`)
  return await res.json() as PartyMapResponse
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

  it('master su party appena creata → 200, body con la sola spawn map auto', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/maps`, {
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as PartyMapResponse[]
    expect(Array.isArray(body)).toBe(true)
    // T16: createParty crea automaticamente la spawn map city.
    expect(body.length).toBe(1)
    expect(body[0]!.isSpawn).toBe(true)
    expect(body[0]!.mapTypeId).toBe('city')
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
    // T16: la party nasce con una spawn city auto, quindi dopo il POST
    // ne abbiamo 2 (la auto + Centro).
    expect(rows.length).toBe(2)
    const target = rows.find(r => r.id === created.id)!
    expect(target).toBeDefined()
    expect(target.memberCount).toBe(0)
    expect(target.zombieCount).toBe(0)
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

describe('GET /api/parties/:seed/maps/:mapId', () => {
  it('master legge dettaglio: 200 + generatedMap.areas non vuoto', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed, { mapTypeId: 'city', name: 'Centro' })
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}`, {
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as PartyMapDetailResponse
    expect(body.id).toBe(created.id)
    expect(body.partySeed).toBe(seed)
    expect(body.mapTypeId).toBe('city')
    expect(Array.isArray(body.generatedMap.areas)).toBe(true)
    expect(body.generatedMap.areas.length).toBeGreaterThan(0)
    expect(typeof body.generatedMap.spawnAreaId).toBe('string')
  })

  it('member non-master legge dettaglio: 200', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed, { mapTypeId: 'country', name: 'Distretto' })
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}`, {
      headers: { cookie: b.cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as PartyMapDetailResponse
    expect(body.id).toBe(created.id)
    expect(body.generatedMap.areas.length).toBeGreaterThan(0)
  })

  it('user non-member → 403 not_member', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed, { mapTypeId: 'city', name: 'Centro' })
    const c = await registerApproveLogin(dbPath, uniqueUsername('c'))
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}`, {
      headers: { cookie: c.cookie }
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('not_member')
  })

  it('mapId inesistente → 404 map_not_found', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/maps/${randomUUID()}`, {
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('map_not_found')
  })
})

describe('DELETE /api/parties/:seed/maps/:mapId', () => {
  it('non-master → 403 master_only', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed, { mapTypeId: 'city', name: 'Centro' })
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: b.cookie }
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('master_only')
  })

  it('mappa spawn → 409 cannot_delete_spawn', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed,
      { mapTypeId: 'city', name: 'Hub', isSpawn: true })
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(409)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('cannot_delete_spawn')
  })

  it('mappa vuota non-spawn → 200 + audit map.delete', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed, { mapTypeId: 'wasteland', name: 'Lande' })
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}`, {
      method: 'DELETE',
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const db = new Database(dbPath)
    try {
      const row = db.prepare(
        'SELECT action, target FROM master_actions WHERE party_seed = ? AND action = ? ORDER BY created_at DESC LIMIT 1'
      ).get(seed, 'map.delete') as { action: string, target: string } | undefined
      expect(row).toBeDefined()
      expect(row!.target).toBe(created.id)
      const stillThere = db.prepare(
        'SELECT id FROM party_maps WHERE id = ?'
      ).get(created.id) as { id: string } | undefined
      expect(stillThere).toBeUndefined()
    } finally {
      db.close()
    }
  })
})

describe('POST /api/parties/:seed/maps/:mapId/set-spawn', () => {
  it('master setta spawn: 200 + audit + isSpawn=true', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const m1 = await createMap(a.cookie, seed,
      { mapTypeId: 'city', name: 'Hub', isSpawn: true })
    const m2 = await createMap(a.cookie, seed, { mapTypeId: 'country', name: 'Periferia' })

    const res = await fetch(`/api/parties/${seed}/maps/${m2.id}/set-spawn`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    const db = new Database(dbPath)
    try {
      const row = db.prepare(
        'SELECT is_spawn FROM party_maps WHERE id = ?'
      ).get(m2.id) as { is_spawn: number }
      expect(row.is_spawn).toBe(1)
      const old = db.prepare(
        'SELECT is_spawn FROM party_maps WHERE id = ?'
      ).get(m1.id) as { is_spawn: number }
      expect(old.is_spawn).toBe(0)
      const audit = db.prepare(
        'SELECT action, target FROM master_actions WHERE party_seed = ? AND action = ? ORDER BY created_at DESC LIMIT 1'
      ).get(seed, 'map.set_spawn') as { action: string, target: string } | undefined
      expect(audit).toBeDefined()
      expect(audit!.target).toBe(m2.id)
    } finally {
      db.close()
    }
  })

  it('non-master → 403 master_only', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createParty(a.cookie, 'Master')
    const created = await createMap(a.cookie, seed, { mapTypeId: 'city', name: 'Centro' })
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/maps/${created.id}/set-spawn`, {
      method: 'POST',
      headers: { cookie: b.cookie }
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('master_only')
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
