import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { registerApproveLogin, uniqueUsername } from '../helpers/e2e-auth'
import {
  openWsWithCookie, nextMessageMatching,
  createPartyApi, joinPartyApi
} from '../helpers/ws-helpers'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-cross-flow-'))
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

// Wrapper minimale: aggiunge il cookie e parsea JSON con throw su non-200.
async function fetchJson<T>(
  path: string,
  init: { method?: string, body?: string, cookie?: string } = {}
): Promise<T> {
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  if (init.cookie) headers.cookie = init.cookie
  const res = await fetch(path, {
    method: init.method ?? 'GET',
    headers,
    body: init.body
  })
  if (res.status !== 200) throw new Error(`${path} status ${res.status}`)
  return await res.json() as T
}

describe('cross-map flow end-to-end (v2d)', () => {
  it('master crea mappa+transition via API, user join+move cross-map riceve player:moved + state:init re-emit', { timeout: 15000 }, async () => {
    // 1. Master register+approve+login
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const seed = await createPartyApi(masterCookie, 'GM')

    // 2. Lista mappe: la party ha già la spawn city auto-creata (T16/T17).
    const mapsList = await fetchJson<PartyMapResponse[]>(
      `/api/parties/${seed}/maps`,
      { cookie: masterCookie }
    )
    const cityMap = mapsList.find(m => m.isSpawn)
    expect(cityMap).toBeDefined()
    const cityMapId = cityMap!.id

    // 3. Master crea seconda mappa country.
    const created = await fetchJson<PartyMapResponse>(
      `/api/parties/${seed}/maps`,
      {
        method: 'POST',
        cookie: masterCookie,
        body: JSON.stringify({ mapTypeId: 'country', name: 'Campagna' })
      }
    )
    const countryMapId = created.id

    // 4. Recupera area ids deterministici dai dettagli map.
    const cityDetail = await fetchJson<PartyMapDetailResponse>(
      `/api/parties/${seed}/maps/${cityMapId}`,
      { cookie: masterCookie }
    )
    const countryDetail = await fetchJson<PartyMapDetailResponse>(
      `/api/parties/${seed}/maps/${countryMapId}`,
      { cookie: masterCookie }
    )
    const cityFromAreaId = cityDetail.generatedMap.spawnAreaId
    const countryToAreaId = countryDetail.generatedMap.spawnAreaId

    // 5. Master crea transition city→country (bidirectional default true).
    await fetchJson(`/api/parties/${seed}/maps/${cityMapId}/transitions`, {
      method: 'POST',
      cookie: masterCookie,
      body: JSON.stringify({
        fromAreaId: cityFromAreaId,
        toMapId: countryMapId,
        toAreaId: countryToAreaId,
        bidirectional: true
      })
    })

    // 6. User register+approve+login + join party.
    const { cookie: userCookie } = await registerApproveLogin(dbPath, uniqueUsername('u'))
    await joinPartyApi(userCookie, seed, 'Pippo')

    // 7. Apri WS user → state:init iniziale con 2 mappe e ≥2 transitions (bidir).
    const ws = await openWsWithCookie(seed, userCookie)
    const init1 = await nextMessageMatching(ws, m => m.type === 'state:init') as {
      me: { currentMapId: string | null, currentAreaId: string }
      maps: Array<{ id: string }>
      transitions: Array<{ id: string, fromMapId: string, toMapId: string }>
    }
    expect(init1.me.currentMapId).toBe(cityMapId)
    expect(init1.maps.length).toBe(2)
    expect(init1.transitions.length).toBeGreaterThanOrEqual(2)

    // 8. User invia move:request cross-map.
    ws.send(JSON.stringify({
      type: 'move:request',
      toAreaId: countryToAreaId,
      toMapId: countryMapId
    }))

    // 9. User riceve player:moved con fromMapId/toMapId corretti.
    const moved = await nextMessageMatching(ws, m => m.type === 'player:moved', 8000) as {
      fromMapId: string | null
      toMapId: string | null
      fromAreaId: string
      toAreaId: string
    }
    expect(moved.toMapId).toBe(countryMapId)
    expect(moved.fromMapId).toBe(cityMapId)
    expect(moved.toAreaId).toBe(countryToAreaId)

    // 10. Re-emit state:init post cross-map (fix e217d26).
    const init2 = await nextMessageMatching(ws, m => m.type === 'state:init', 8000) as {
      me: { currentMapId: string | null, currentAreaId: string }
    }
    expect(init2.me.currentMapId).toBe(countryMapId)
    expect(init2.me.currentAreaId).toBe(countryToAreaId)

    ws.close()
  })

  it('user move cross-map verso area NON connessa → error not_a_transition', { timeout: 15000 }, async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const seed = await createPartyApi(masterCookie, 'GM2')

    const mapsList = await fetchJson<PartyMapResponse[]>(
      `/api/parties/${seed}/maps`,
      { cookie: masterCookie }
    )
    const cityMap = mapsList.find(m => m.isSpawn)!

    const country = await fetchJson<PartyMapResponse>(
      `/api/parties/${seed}/maps`,
      {
        method: 'POST',
        cookie: masterCookie,
        body: JSON.stringify({ mapTypeId: 'country', name: 'Campagna2' })
      }
    )

    const cityDetail = await fetchJson<PartyMapDetailResponse>(
      `/api/parties/${seed}/maps/${cityMap.id}`,
      { cookie: masterCookie }
    )
    const countryDetail = await fetchJson<PartyMapDetailResponse>(
      `/api/parties/${seed}/maps/${country.id}`,
      { cookie: masterCookie }
    )
    const cityFromAreaId = cityDetail.generatedMap.spawnAreaId
    const countryToAreaId = countryDetail.generatedMap.spawnAreaId

    // Crea transition solo verso countryToAreaId.
    await fetchJson(`/api/parties/${seed}/maps/${cityMap.id}/transitions`, {
      method: 'POST',
      cookie: masterCookie,
      body: JSON.stringify({
        fromAreaId: cityFromAreaId,
        toMapId: country.id,
        toAreaId: countryToAreaId,
        bidirectional: true
      })
    })

    // Pesca un'area country diversa da quella connessa.
    const otherCountryArea = countryDetail.generatedMap.areas.find(a => a.id !== countryToAreaId)
    expect(otherCountryArea).toBeDefined()

    const { cookie: userCookie } = await registerApproveLogin(dbPath, uniqueUsername('u'))
    await joinPartyApi(userCookie, seed, 'Luca')

    const ws = await openWsWithCookie(seed, userCookie)
    await nextMessageMatching(ws, m => m.type === 'state:init')

    ws.send(JSON.stringify({
      type: 'move:request',
      toAreaId: otherCountryArea!.id,
      toMapId: country.id
    }))

    const err = await nextMessageMatching(ws, m => m.type === 'error', 8000) as { code: string }
    expect(err.code).toBe('not_a_transition')

    ws.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
