import { describe, it, expect } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import Database from 'better-sqlite3'
import { registerApproveLogin, uniqueUsername } from '../helpers/e2e-auth'
import {
  openWsWithCookie, nextMessageMatching,
  createPartyApi, joinPartyApi
} from '../helpers/ws-helpers'
import { generate } from '~~/shared/map/generators'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-cross-map-'))
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

interface MapSetup {
  cityMapId: string
  cityMapSeed: string
  countryMapId: string
  countryMapSeed: string
  cityFromAreaId: string
  cityOtherAreaId: string
  cityNonAdjacentAreaId: string
  countryToAreaId: string
  countryOtherAreaId: string
  transitionId: string
}

function uuid(): string {
  return randomUUID()
}

// Setup multi-mappa diretto su DB condiviso col server di test:
// - riusa la spawn city già creata da T16/createParty come cityMap
// - aggiunge una countryMap
// - 1 transition city→country (non bidirezionale, basta una direzione)
function setupMaps(seed: string, playerIds: string[]): MapSetup {
  const db = new Database(dbPath)
  try {
    const spawnRow = db.prepare(
      `SELECT id, map_seed FROM party_maps WHERE party_seed = ? AND is_spawn = 1`
    ).get(seed) as { id: string, map_seed: string } | undefined
    if (!spawnRow) throw new Error('spawn map mancante: createParty l\'avrebbe dovuta creare')
    const cityMapId = spawnRow.id
    const cityMapSeed = spawnRow.map_seed

    const countryMapId = uuid()
    const countryMapSeed = uuid()
    const now = Date.now()
    db.prepare(`INSERT INTO party_maps (id, party_seed, map_type_id, map_seed, name, is_spawn, created_at)
                VALUES (?, ?, 'country', ?, 'Campagna', 0, ?)`)
      .run(countryMapId, seed, countryMapSeed, now + 1)

    // Genera le mappe per scegliere area ids deterministici
    const cityGm = generate('city', cityMapSeed, { density: 0.5, roadStyle: 'grid' })
    const countryGm = generate('country', countryMapSeed, { forestRatio: 0.4, riverChance: 0.6 })

    const cityFromAreaId = cityGm.spawnAreaId
    const cityAdjs = cityGm.adjacency[cityFromAreaId] ?? []
    const cityOtherAreaId = cityAdjs[0]!
    const cityNonAdjacentAreaId = cityGm.areas.find(a => a.id !== cityFromAreaId && !cityAdjs.includes(a.id))!.id

    const countryToAreaId = countryGm.spawnAreaId
    const countryOtherAreaId = countryGm.areas.find(a => a.id !== countryToAreaId)!.id

    const transitionId = uuid()
    db.prepare(`INSERT INTO map_transitions (id, party_seed, from_map_id, from_area_id, to_map_id, to_area_id, label, created_at)
                VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`)
      .run(transitionId, seed, cityMapId, cityFromAreaId, countryMapId, countryToAreaId, now)

    // I player hanno già current_map_id = cityMapId e current_area_id =
    // cityFromAreaId grazie a T16/T17 (createParty/joinParty). Niente UPDATE.
    void playerIds

    return {
      cityMapId, cityMapSeed,
      countryMapId, countryMapSeed,
      cityFromAreaId, cityOtherAreaId, cityNonAdjacentAreaId,
      countryToAreaId, countryOtherAreaId,
      transitionId
    }
  } finally {
    db.close()
  }
}

function getPlayerIds(seed: string): { masterId: string, userIds: Map<string, string> } {
  const db = new Database(dbPath)
  try {
    const rows = db.prepare(
      `SELECT id, nickname, role FROM players WHERE party_seed = ?`
    ).all(seed) as { id: string, nickname: string, role: 'user' | 'master' }[]
    let masterId = ''
    const userIds = new Map<string, string>()
    for (const r of rows) {
      if (r.role === 'master') masterId = r.id
      else userIds.set(r.nickname, r.id)
    }
    return { masterId, userIds }
  } finally {
    db.close()
  }
}

function getPlayerArea(playerId: string): { mapId: string | null, areaId: string } {
  const db = new Database(dbPath)
  try {
    const stmt = db.prepare('SELECT current_map_id, current_area_id FROM players WHERE id = ?')
    const row = stmt.get(playerId) as { current_map_id: string | null, current_area_id: string }
    return { mapId: row.current_map_id, areaId: row.current_area_id }
  } finally {
    db.close()
  }
}

describe('move:request cross-map (v2d)', () => {
  it('user clicca area con valid transition cross-map → player:moved con fromMapId/toMapId', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mc1'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('ac1'))
    const seed = await createPartyApi(masterCookie, 'CM1')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const { userIds } = getPlayerIds(seed)
    const annaId = userIds.get('Anna')!
    const masterId = getPlayerIds(seed).masterId
    const m = setupMaps(seed, [annaId, masterId])

    const annaWs = await openWsWithCookie(seed, annaCookie)
    const init = await nextMessageMatching(annaWs, ev => ev.type === 'state:init')
    expect((init as { me: { currentMapId: string | null } }).me.currentMapId).toBe(m.cityMapId)
    expect((init as { maps: unknown[] }).maps.length).toBe(2)
    expect((init as { transitions: unknown[] }).transitions.length).toBeGreaterThanOrEqual(1)

    annaWs.send(JSON.stringify({
      type: 'move:request',
      toAreaId: m.countryToAreaId,
      toMapId: m.countryMapId
    }))
    const moved = await nextMessageMatching(annaWs, ev => ev.type === 'player:moved')
    const movedTyped = moved as { fromMapId: string | null, toMapId: string | null, fromAreaId: string, toAreaId: string }
    expect(movedTyped.fromMapId).toBe(m.cityMapId)
    expect(movedTyped.toMapId).toBe(m.countryMapId)
    expect(movedTyped.fromAreaId).toBe(m.cityFromAreaId)
    expect(movedTyped.toAreaId).toBe(m.countryToAreaId)

    // DB aggiornato: anna ha currentMapId=country, currentAreaId=countryToAreaId
    const after = getPlayerArea(annaId)
    expect(after.mapId).toBe(m.countryMapId)
    expect(after.areaId).toBe(m.countryToAreaId)

    annaWs.close()
  })

  it('user clicca area cross-map SENZA transition → error not_a_transition', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mc2'))
    const { cookie: lucaCookie } = await registerApproveLogin(dbPath, uniqueUsername('lc2'))
    const seed = await createPartyApi(masterCookie, 'CM2')
    await joinPartyApi(lucaCookie, seed, 'Luca')

    const { userIds, masterId } = getPlayerIds(seed)
    const lucaId = userIds.get('Luca')!
    const m = setupMaps(seed, [lucaId, masterId])

    const lucaWs = await openWsWithCookie(seed, lucaCookie)
    await nextMessageMatching(lucaWs, ev => ev.type === 'state:init')

    // Tentativo cross-map verso un'area country diversa da quella del transition.
    lucaWs.send(JSON.stringify({
      type: 'move:request',
      toAreaId: m.countryOtherAreaId,
      toMapId: m.countryMapId
    }))
    const err = await nextMessageMatching(lucaWs, ev => ev.type === 'error')
    expect((err as { code: string }).code).toBe('not_a_transition')

    lucaWs.close()
  })

  it('master clicca area cross-map senza transition → ok (admin teleport)', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mc3'))
    const seed = await createPartyApi(masterCookie, 'CM3')

    const { masterId } = getPlayerIds(seed)
    const m = setupMaps(seed, [masterId])

    const wsM = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(wsM, ev => ev.type === 'state:init')

    // Master sposta su area country DIVERSA da quella del transition: ok.
    wsM.send(JSON.stringify({
      type: 'move:request',
      toAreaId: m.countryOtherAreaId,
      toMapId: m.countryMapId
    }))
    const moved = await nextMessageMatching(wsM, ev => ev.type === 'player:moved')
    const movedTyped = moved as { toMapId: string | null, toAreaId: string }
    expect(movedTyped.toMapId).toBe(m.countryMapId)
    expect(movedTyped.toAreaId).toBe(m.countryOtherAreaId)

    wsM.close()
  })

  it('user intra-map move usa GeneratedMap.adjacency: area non adiacente → not_adjacent', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mc4'))
    const { cookie: beaCookie } = await registerApproveLogin(dbPath, uniqueUsername('bc4'))
    const seed = await createPartyApi(masterCookie, 'CM4')
    await joinPartyApi(beaCookie, seed, 'Bea')

    const { userIds, masterId } = getPlayerIds(seed)
    const beaId = userIds.get('Bea')!
    const m = setupMaps(seed, [beaId, masterId])

    const wsB = await openWsWithCookie(seed, beaCookie)
    await nextMessageMatching(wsB, ev => ev.type === 'state:init')

    // Move intra-mappa su un'area NON adiacente nel grafo del city generator.
    wsB.send(JSON.stringify({
      type: 'move:request',
      toAreaId: m.cityNonAdjacentAreaId
    }))
    const err = await nextMessageMatching(wsB, ev => ev.type === 'error')
    expect((err as { code: string }).code).toBe('not_adjacent')

    wsB.close()
  })

  it('user intra-map move su area adiacente nel grafo generato → ok', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mc5'))
    const { cookie: caroCookie } = await registerApproveLogin(dbPath, uniqueUsername('cc5'))
    const seed = await createPartyApi(masterCookie, 'CM5')
    await joinPartyApi(caroCookie, seed, 'Caro')

    const { userIds, masterId } = getPlayerIds(seed)
    const caroId = userIds.get('Caro')!
    const m = setupMaps(seed, [caroId, masterId])

    const wsC = await openWsWithCookie(seed, caroCookie)
    await nextMessageMatching(wsC, ev => ev.type === 'state:init')

    wsC.send(JSON.stringify({
      type: 'move:request',
      toAreaId: m.cityOtherAreaId
    }))
    const moved = await nextMessageMatching(wsC, ev => ev.type === 'player:moved')
    const movedTyped = moved as { fromMapId: string | null, toMapId: string | null, fromAreaId: string, toAreaId: string }
    expect(movedTyped.fromMapId).toBe(m.cityMapId)
    expect(movedTyped.toMapId).toBe(m.cityMapId)
    expect(movedTyped.toAreaId).toBe(m.cityOtherAreaId)

    wsC.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
