import { and, asc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { partyMaps, players, zombies, mapTransitions } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'
import { getSettingNumber } from '~~/server/services/system-settings'
import { MAX_MAPS_PER_PARTY } from '~~/shared/limits'

// v2d: gestione delle istanze di mappa per party. Ogni party può avere fino
// a `limits.maxMapsPerParty` (default MAX_MAPS_PER_PARTY=10) mappe coesistenti
// e una sola contrassegnata come spawn (entry point per i nuovi player).

export interface PartyMapRow {
  id: string
  partySeed: string
  mapTypeId: string
  mapSeed: string
  name: string
  isSpawn: boolean
  createdAt: number
}

interface RawRow {
  id: string
  partySeed: string
  mapTypeId: string
  mapSeed: string
  name: string
  // drizzle ritorna boolean | 0 | 1 in lettura su integer mode:'boolean'.
  isSpawn: boolean | 0 | 1
  createdAt: number
}

function mapRow(r: RawRow): PartyMapRow {
  return {
    id: r.id,
    partySeed: r.partySeed,
    mapTypeId: r.mapTypeId,
    mapSeed: r.mapSeed,
    name: r.name,
    isSpawn: Boolean(r.isSpawn),
    createdAt: r.createdAt
  }
}

export function listPartyMaps(db: Db, partySeed: string): PartyMapRow[] {
  const rows = db.select().from(partyMaps)
    .where(eq(partyMaps.partySeed, partySeed))
    .orderBy(asc(partyMaps.createdAt))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function findPartyMap(db: Db, mapId: string): PartyMapRow | null {
  const row = db.select().from(partyMaps)
    .where(eq(partyMaps.id, mapId))
    .get() as RawRow | undefined
  return row ? mapRow(row) : null
}

export function findSpawnMap(db: Db, partySeed: string): PartyMapRow | null {
  const row = db.select().from(partyMaps)
    .where(and(eq(partyMaps.partySeed, partySeed), eq(partyMaps.isSpawn, true)))
    .get() as RawRow | undefined
  return row ? mapRow(row) : null
}

export function countMapsForParty(db: Db, partySeed: string): number {
  const rows = db.select({ id: partyMaps.id }).from(partyMaps)
    .where(eq(partyMaps.partySeed, partySeed))
    .all()
  return rows.length
}

export interface CreatePartyMapInput {
  partySeed: string
  mapTypeId: string
  mapSeed?: string
  name: string
  isSpawn?: boolean
}

export function createPartyMap(db: Db, input: CreatePartyMapInput): PartyMapRow {
  const max = getSettingNumber(db, 'limits.maxMapsPerParty', MAX_MAPS_PER_PARTY)
  if (countMapsForParty(db, input.partySeed) >= max) {
    throw new DomainError('map_limit', `party ${input.partySeed}`)
  }

  const id = generateUuid()
  const mapSeed = input.mapSeed ?? generateUuid()
  const isSpawn = input.isSpawn === true
  const now = Date.now()

  // Se la nuova mappa è spawn, togliamo isSpawn dalle altre della stessa party
  // PRIMA di inserire (così la nuova resta unica).
  if (isSpawn) {
    db.update(partyMaps)
      .set({ isSpawn: false })
      .where(eq(partyMaps.partySeed, input.partySeed))
      .run()
  }

  const row = {
    id,
    partySeed: input.partySeed,
    mapTypeId: input.mapTypeId,
    mapSeed,
    name: input.name,
    isSpawn,
    createdAt: now
  }
  db.insert(partyMaps).values(row).run()
  return row
}

export function setSpawnMap(db: Db, partySeed: string, mapId: string): void {
  const target = findPartyMap(db, mapId)
  if (!target || target.partySeed !== partySeed) {
    throw new DomainError('not_found', `map ${mapId}`)
  }
  // Single statement che azzera tutte le altre della stessa party e una
  // seconda update sul target. Evitare un'unica CASE è più semplice e
  // leggibile su SQLite, le righe sono ≤10 per party (MAX_MAPS_PER_PARTY).
  db.update(partyMaps)
    .set({ isSpawn: false })
    .where(eq(partyMaps.partySeed, partySeed))
    .run()
  db.update(partyMaps)
    .set({ isSpawn: true })
    .where(eq(partyMaps.id, mapId))
    .run()
}

export function deletePartyMap(db: Db, mapId: string): void {
  const target = findPartyMap(db, mapId)
  if (!target) {
    throw new DomainError('not_found', `map ${mapId}`)
  }
  if (target.isSpawn) {
    throw new DomainError('cannot_delete_spawn', `map ${mapId}`)
  }
  // Pre-checks "mappa non vuota": players, zombies, transition entranti.
  const playersOnMap = db.select({ id: players.id }).from(players)
    .where(eq(players.currentMapId, mapId))
    .all()
  if (playersOnMap.length > 0) {
    throw new DomainError('map_not_empty', 'players')
  }
  const zombiesOnMap = db.select({ id: zombies.id }).from(zombies)
    .where(eq(zombies.mapId, mapId))
    .all()
  if (zombiesOnMap.length > 0) {
    throw new DomainError('map_not_empty', 'zombies')
  }
  const incomingTransitions = db.select({ id: mapTransitions.id }).from(mapTransitions)
    .where(eq(mapTransitions.toMapId, mapId))
    .all()
  if (incomingTransitions.length > 0) {
    throw new DomainError('map_not_empty', 'transitions')
  }
  db.delete(partyMaps).where(eq(partyMaps.id, mapId)).run()
}
