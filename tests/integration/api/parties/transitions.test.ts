import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import Database from 'better-sqlite3'
import { randomUUID } from 'node:crypto'
import {
  registerApproveLogin, uniqueUsername
} from '../../helpers/e2e-auth'

const rootDir = fileURLToPath(new URL('../../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-transitions-'))
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

interface TransitionRow {
  id: string
  partySeed: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
  createdAt: number
}

interface TransitionsListResponse {
  outgoing: TransitionRow[]
  incoming: TransitionRow[]
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

async function fetchMapDetail(
  cookie: string, seed: string, mapId: string
): Promise<PartyMapDetailResponse> {
  const res = await fetch(`/api/parties/${seed}/maps/${mapId}`, {
    headers: { cookie }
  })
  if (res.status !== 200) throw new Error(`detail failed ${res.status}`)
  return await res.json() as PartyMapDetailResponse
}

interface TwoMaps {
  cookie: string
  seed: string
  city: PartyMapDetailResponse
  country: PartyMapDetailResponse
}

// Setup di base: master + 2 mappe (una city spawn, una country) con i loro
// generatedMap già caricati per pescare areaId validi.
async function setupTwoMaps(): Promise<TwoMaps> {
  const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
  const seed = await createParty(a.cookie, 'Master')
  const cityRow = await createMap(a.cookie, seed,
    { mapTypeId: 'city', name: 'Centro', isSpawn: true })
  const countryRow = await createMap(a.cookie, seed,
    { mapTypeId: 'country', name: 'Periferia' })
  const city = await fetchMapDetail(a.cookie, seed, cityRow.id)
  const country = await fetchMapDetail(a.cookie, seed, countryRow.id)
  return { cookie: a.cookie, seed, city, country }
}

describe('GET /api/parties/:seed/maps/:mapId/transitions', () => {
  it('senza cookie → 401', async () => {
    const { seed, city } = await setupTwoMaps()
    const res = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`)
    expect(res.status).toBe(401)
  })

  it('master con mappa senza transizioni → 200, body { outgoing: [], incoming: [] }', async () => {
    const { cookie, seed, city } = await setupTwoMaps()
    const res = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      headers: { cookie }
    })
    expect(res.status).toBe(200)
    const body = await res.json() as TransitionsListResponse
    expect(body.outgoing).toEqual([])
    expect(body.incoming).toEqual([])
  })

  it('mapId inesistente → 404 map_not_found', async () => {
    const { cookie, seed } = await setupTwoMaps()
    const res = await fetch(`/api/parties/${seed}/maps/${randomUUID()}/transitions`, {
      headers: { cookie }
    })
    expect(res.status).toBe(404)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('map_not_found')
  })
})

describe('POST /api/parties/:seed/maps/:mapId/transitions', () => {
  it('master crea bidirezionale di default → 200, rows.length === 2', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const res = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        fromAreaId,
        toMapId: country.id,
        toAreaId,
        label: 'Strada principale'
      })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { rows: TransitionRow[] }
    expect(body.rows.length).toBe(2)
    const direct = body.rows.find(r => r.fromMapId === city.id)
    const reverse = body.rows.find(r => r.fromMapId === country.id)
    expect(direct).toBeDefined()
    expect(reverse).toBeDefined()
    expect(direct!.fromAreaId).toBe(fromAreaId)
    expect(direct!.toAreaId).toBe(toAreaId)
    expect(reverse!.fromAreaId).toBe(toAreaId)
    expect(reverse!.toAreaId).toBe(fromAreaId)
  })

  it('POST poi GET outgoing contiene la transition', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const post = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromAreaId, toMapId: country.id, toAreaId })
    })
    expect(post.status).toBe(200)
    const list = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      headers: { cookie }
    })
    expect(list.status).toBe(200)
    const body = await list.json() as TransitionsListResponse
    expect(body.outgoing.length).toBe(1)
    expect(body.outgoing[0]!.toMapId).toBe(country.id)
    expect(body.outgoing[0]!.fromAreaId).toBe(fromAreaId)
    expect(body.incoming.length).toBe(1)
    expect(body.incoming[0]!.fromMapId).toBe(country.id)
  })

  it('bidirectional: false → rows.length === 1', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const res = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        fromAreaId,
        toMapId: country.id,
        toAreaId,
        bidirectional: false
      })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as { rows: TransitionRow[] }
    expect(body.rows.length).toBe(1)
    expect(body.rows[0]!.fromMapId).toBe(city.id)
    expect(body.rows[0]!.toMapId).toBe(country.id)

    // Verifica speculare assente sul GET di country
    const list = await fetch(`/api/parties/${seed}/maps/${country.id}/transitions`, {
      headers: { cookie }
    })
    const lbody = await list.json() as TransitionsListResponse
    expect(lbody.outgoing.length).toBe(0)
    expect(lbody.incoming.length).toBe(1)
  })

  it('fromAreaId inesistente → 400 transition_invalid', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const toAreaId = country.generatedMap.areas[0]!.id
    const res = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        fromAreaId: 'area-inesistente',
        toMapId: country.id,
        toAreaId
      })
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('transition_invalid')
  })

  it('user non-master → 403 master_only', async () => {
    const { seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ fromAreaId, toMapId: country.id, toAreaId })
    })
    expect(res.status).toBe(403)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('master_only')
  })

  it('audit log map.create_transition presente dopo POST', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const post = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({
        fromAreaId,
        toMapId: country.id,
        toAreaId,
        label: 'Porta'
      })
    })
    expect(post.status).toBe(200)
    const created = await post.json() as { rows: TransitionRow[] }

    const db = new Database(dbPath)
    try {
      const row = db.prepare(
        'SELECT action, target, payload FROM master_actions WHERE party_seed = ? AND action = ? ORDER BY created_at DESC LIMIT 1'
      ).get(seed, 'map.create_transition') as
        { action: string, target: string, payload: string } | undefined
      expect(row).toBeDefined()
      expect(row!.action).toBe('map.create_transition')
      expect(row!.target).toBe(city.id)
      const payload = JSON.parse(row!.payload) as Record<string, unknown>
      expect(payload.fromAreaId).toBe(fromAreaId)
      expect(payload.toMapId).toBe(country.id)
      expect(payload.toAreaId).toBe(toAreaId)
      expect(payload.label).toBe('Porta')
      expect(payload.bidirectional).toBe(true)
      expect(Array.isArray(payload.createdIds)).toBe(true)
      expect((payload.createdIds as string[]).length).toBe(2)
      expect((payload.createdIds as string[]).sort())
        .toEqual(created.rows.map(r => r.id).sort())
    } finally {
      db.close()
    }
  })
})

describe('DELETE /api/parties/:seed/maps/:mapId/transitions/:transitionId', () => {
  it('master cancella bidirezionale → 200, GET successivo non la mostra; speculare scompare', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const post = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromAreaId, toMapId: country.id, toAreaId })
    })
    const created = await post.json() as { rows: TransitionRow[] }
    const direct = created.rows.find(r => r.fromMapId === city.id)!
    const res = await fetch(
      `/api/parties/${seed}/maps/${city.id}/transitions/${direct.id}`,
      { method: 'DELETE', headers: { cookie } }
    )
    expect(res.status).toBe(200)
    const body = await res.json() as { ok: boolean }
    expect(body.ok).toBe(true)

    // Sia outgoing su city sia outgoing su country devono essere vuoti
    const cityList = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      headers: { cookie }
    }).then(r => r.json() as Promise<TransitionsListResponse>)
    expect(cityList.outgoing).toEqual([])
    expect(cityList.incoming).toEqual([])
    const countryList = await fetch(`/api/parties/${seed}/maps/${country.id}/transitions`, {
      headers: { cookie }
    }).then(r => r.json() as Promise<TransitionsListResponse>)
    expect(countryList.outgoing).toEqual([])
    expect(countryList.incoming).toEqual([])

    // Audit map.delete_transition con target = transitionId
    const db = new Database(dbPath)
    try {
      const row = db.prepare(
        'SELECT action, target, payload FROM master_actions WHERE party_seed = ? AND action = ? ORDER BY created_at DESC LIMIT 1'
      ).get(seed, 'map.delete_transition') as
        { action: string, target: string, payload: string } | undefined
      expect(row).toBeDefined()
      expect(row!.target).toBe(direct.id)
      const payload = JSON.parse(row!.payload) as Record<string, unknown>
      expect(payload.fromMapId).toBe(city.id)
      expect(payload.toMapId).toBe(country.id)
    } finally {
      db.close()
    }
  })

  it('transitionId inesistente → 404 not_found', async () => {
    const { cookie, seed, city } = await setupTwoMaps()
    const res = await fetch(
      `/api/parties/${seed}/maps/${city.id}/transitions/${randomUUID()}`,
      { method: 'DELETE', headers: { cookie } }
    )
    expect(res.status).toBe(404)
    const body = await res.json() as { statusMessage?: string }
    expect(body.statusMessage).toBe('not_found')
  })

  it('non-master → 403 master_only', async () => {
    const { cookie, seed, city, country } = await setupTwoMaps()
    const fromAreaId = city.generatedMap.areas[0]!.id
    const toAreaId = country.generatedMap.areas[0]!.id
    const post = await fetch(`/api/parties/${seed}/maps/${city.id}/transitions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ fromAreaId, toMapId: country.id, toAreaId })
    })
    const created = await post.json() as { rows: TransitionRow[] }
    const direct = created.rows.find(r => r.fromMapId === city.id)!
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(
      `/api/parties/${seed}/maps/${city.id}/transitions/${direct.id}`,
      { method: 'DELETE', headers: { cookie: b.cookie } }
    )
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
