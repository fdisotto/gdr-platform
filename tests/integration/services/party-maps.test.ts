import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import {
  partyMaps, players, zombies, mapTransitions
} from '~~/server/db/schema'
import {
  listPartyMaps, findPartyMap, createPartyMap, setSpawnMap,
  deletePartyMap, findSpawnMap, countMapsForParty
} from '~~/server/services/party-maps'
import { setSetting, invalidateCache } from '~~/server/services/system-settings'
import { generateUuid } from '~~/server/utils/crypto'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterUserId: string

beforeEach(async () => {
  invalidateCache()
  db = createTestDb()
  masterUserId = await createApprovedUser(db, 'master')
  const r = await createParty(db, { userId: masterUserId, displayName: 'Master' })
  seed = r.seed
})

describe('party-maps service', () => {
  // v2d (T16): createParty crea automaticamente la spawn map. Quindi
  // dopo il beforeEach c'è già una mappa city marcata isSpawn=true.
  it('listPartyMaps dopo createParty ha 1 mappa di spawn city', () => {
    const list = listPartyMaps(db, seed)
    expect(list).toHaveLength(1)
    expect(list[0]!.isSpawn).toBe(true)
    expect(list[0]!.mapTypeId).toBe('city')
  })

  it('createPartyMap con campi minimi inserisce riga e ritorna PartyMapRow', () => {
    const row = createPartyMap(db, {
      partySeed: seed,
      mapTypeId: 'city',
      name: 'Centro'
    })
    expect(row.id).toMatch(/[0-9a-f-]{36}/)
    expect(row.partySeed).toBe(seed)
    expect(row.mapTypeId).toBe('city')
    expect(row.name).toBe('Centro')
    expect(row.isSpawn).toBe(false)
    expect(row.mapSeed.length).toBeGreaterThan(0)
    expect(row.createdAt).toBeGreaterThan(0)

    const list = listPartyMaps(db, seed)
    // 1 (spawn auto-creata) + 1 (questa) = 2
    expect(list).toHaveLength(2)
    expect(list.map(m => m.id)).toContain(row.id)
  })

  it('createPartyMap con isSpawn=true setta spawn e toglie isSpawn dalle altre', () => {
    const a = createPartyMap(db, {
      partySeed: seed, mapTypeId: 'city', name: 'A', isSpawn: true
    })
    const b = createPartyMap(db, {
      partySeed: seed, mapTypeId: 'country', name: 'B', isSpawn: true
    })
    const fa = findPartyMap(db, a.id)!
    const fb = findPartyMap(db, b.id)!
    expect(fa.isSpawn).toBe(false)
    expect(fb.isSpawn).toBe(true)
  })

  it('findPartyMap ritorna riga o null', () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    expect(findPartyMap(db, a.id)?.id).toBe(a.id)
    expect(findPartyMap(db, 'not-exists')).toBeNull()
  })

  it('listPartyMaps è ordinato per createdAt asc', () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    // Forziamo createdAt manualmente per controllo deterministico.
    // La spawn auto-creata da createParty ha createdAt grande (Date.now);
    // qui i due nuovi sono 50 e 100 → tutti vengono prima della spawn.
    db.update(partyMaps).set({ createdAt: 100 })
      .where(eq(partyMaps.id, a.id)).run()
    const b = createPartyMap(db, { partySeed: seed, mapTypeId: 'country', name: 'B' })
    db.update(partyMaps).set({ createdAt: 50 })
      .where(eq(partyMaps.id, b.id)).run()
    const list = listPartyMaps(db, seed)
    // Filtriamo le righe interessate per il test, mantenendo l'ordine asc.
    const filtered = list.filter(m => m.id === a.id || m.id === b.id)
    expect(filtered.map(m => m.id)).toEqual([b.id, a.id])
  })

  it('setSpawnMap toggle: prima A spawn, poi B spawn → A non più spawn', () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    const b = createPartyMap(db, { partySeed: seed, mapTypeId: 'country', name: 'B' })
    setSpawnMap(db, seed, a.id)
    expect(findPartyMap(db, a.id)!.isSpawn).toBe(true)
    expect(findPartyMap(db, b.id)!.isSpawn).toBe(false)
    setSpawnMap(db, seed, b.id)
    expect(findPartyMap(db, a.id)!.isSpawn).toBe(false)
    expect(findPartyMap(db, b.id)!.isSpawn).toBe(true)
  })

  it('setSpawnMap su mapId di altra party → not_found', async () => {
    const otherUser = await createApprovedUser(db, 'other')
    const otherParty = await createParty(db, { userId: otherUser, displayName: 'Other' })
    const m = createPartyMap(db, {
      partySeed: otherParty.seed, mapTypeId: 'city', name: 'X'
    })
    expect(() => setSpawnMap(db, seed, m.id)).toThrowError(/not_found/)
  })

  it('setSpawnMap su mapId inesistente → not_found', () => {
    expect(() => setSpawnMap(db, seed, 'unknown')).toThrowError(/not_found/)
  })

  it('deletePartyMap su mappa vuota non-spawn cancella la riga', () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    deletePartyMap(db, a.id)
    expect(findPartyMap(db, a.id)).toBeNull()
  })

  it('deletePartyMap su mapId inesistente → not_found', () => {
    expect(() => deletePartyMap(db, 'unknown')).toThrowError(/not_found/)
  })

  it('deletePartyMap con players nella mappa → map_not_empty', async () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    // Inserisco un player diretto con currentMapId = a.id (user diverso dal
    // master per non violare l'UNIQUE su (party_seed, user_id)).
    const otherUser = await createApprovedUser(db, 'tester')
    const playerId = generateUuid()
    const now = Date.now()
    db.insert(players).values({
      id: playerId,
      partySeed: seed,
      userId: otherUser,
      nickname: 'Tester',
      role: 'user',
      currentMapId: a.id,
      currentAreaId: 'piazza',
      isMuted: false,
      isKicked: false,
      joinedAt: now,
      lastSeenAt: now,
      sessionToken: 'tok-tester'
    }).run()
    expect(() => deletePartyMap(db, a.id)).toThrowError(/map_not_empty/)
  })

  it('deletePartyMap con zombies nella mappa → map_not_empty', () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    db.insert(zombies).values({
      id: 'z-1',
      partySeed: seed,
      mapId: a.id,
      areaId: 'piazza',
      x: 0, y: 0,
      spawnedAt: Date.now(),
      npcName: null, npcRole: null
    }).run()
    expect(() => deletePartyMap(db, a.id)).toThrowError(/map_not_empty/)
  })

  it('deletePartyMap con transition entrante → map_not_empty', () => {
    const a = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    const b = createPartyMap(db, { partySeed: seed, mapTypeId: 'country', name: 'B' })
    db.insert(mapTransitions).values({
      id: generateUuid(),
      partySeed: seed,
      fromMapId: b.id,
      fromAreaId: 'piazza',
      toMapId: a.id,
      toAreaId: 'piazza',
      label: null,
      createdAt: Date.now()
    }).run()
    expect(() => deletePartyMap(db, a.id)).toThrowError(/map_not_empty/)
  })

  it('deletePartyMap su mappa spawn → cannot_delete_spawn', () => {
    const a = createPartyMap(db, {
      partySeed: seed, mapTypeId: 'city', name: 'A', isSpawn: true
    })
    expect(() => deletePartyMap(db, a.id)).toThrowError(/cannot_delete_spawn/)
  })

  it('findSpawnMap senza spawn ritorna null', () => {
    // v2d (T16): createParty ha già creato 1 spawn city; per testare il
    // null branch tolgo lo spawn flag dalla riga esistente.
    db.update(partyMaps).set({ isSpawn: false })
      .where(eq(partyMaps.partySeed, seed)).run()
    createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    expect(findSpawnMap(db, seed)).toBeNull()
  })

  it('findSpawnMap con spawn settato ritorna la riga', () => {
    // Tolgo lo spawn dalla riga auto-creata, poi creo un nuovo spawn.
    db.update(partyMaps).set({ isSpawn: false })
      .where(eq(partyMaps.partySeed, seed)).run()
    const a = createPartyMap(db, {
      partySeed: seed, mapTypeId: 'city', name: 'A', isSpawn: true
    })
    expect(findSpawnMap(db, seed)?.id).toBe(a.id)
  })

  it('countMapsForParty conta solo le mappe della party', async () => {
    // Parte da 1 (spawn auto-creata).
    expect(countMapsForParty(db, seed)).toBe(1)
    createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    createPartyMap(db, { partySeed: seed, mapTypeId: 'country', name: 'B' })
    expect(countMapsForParty(db, seed)).toBe(3)
    // Mappe di altra party non contano
    const otherUser = await createApprovedUser(db, 'other')
    const otherParty = await createParty(db, { userId: otherUser, displayName: 'Other' })
    createPartyMap(db, { partySeed: otherParty.seed, mapTypeId: 'city', name: 'X' })
    expect(countMapsForParty(db, seed)).toBe(3)
  })

  it('createPartyMap quando count >= MAX (default 10) → map_limit', () => {
    // Parte da 1 (spawn auto-creata): possiamo aggiungerne altre 9 prima
    // di superare il default 10.
    for (let i = 0; i < 9; i++) {
      createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: `M${i}` })
    }
    expect(() =>
      createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'M9' })
    ).toThrowError(/map_limit/)
  })

  it('createPartyMap rispetta override settings.limits.maxMapsPerParty', () => {
    // Override a 2: la spawn auto-creata occupa già 1 slot.
    setSetting(db, 'limits.maxMapsPerParty', 2, null)
    createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'A' })
    expect(() =>
      createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'B' })
    ).toThrowError(/map_limit/)
  })

  it('createPartyMap usa mapSeed esplicito se passato', () => {
    const row = createPartyMap(db, {
      partySeed: seed, mapTypeId: 'city', name: 'A', mapSeed: 'fixed-seed-xyz'
    })
    expect(row.mapSeed).toBe('fixed-seed-xyz')
  })
})
