import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { mapTransitions } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'
import { findMapType, parseDefaultParams } from '~~/server/services/map-types'
import { findPartyMap } from '~~/server/services/party-maps'
import { generate } from '~~/shared/map/generators'

// v2d: archi di transizione cross-map. Le transizioni intra-mappa sono
// implicite nel grafo della GeneratedMap; qui restano solo i link che
// attraversano due mappe distinte della stessa party. Le transizioni
// vengono di norma create bidirezionali (default), ma la creazione
// monodirezionale è supportata per scenari tipo "uscita di sicurezza".

export interface TransitionRow {
  id: string
  partySeed: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
  createdAt: number
}

interface RawRow {
  id: string
  partySeed: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
  createdAt: number
}

function mapRow(r: RawRow): TransitionRow {
  return {
    id: r.id,
    partySeed: r.partySeed,
    fromMapId: r.fromMapId,
    fromAreaId: r.fromAreaId,
    toMapId: r.toMapId,
    toAreaId: r.toAreaId,
    label: r.label,
    createdAt: r.createdAt
  }
}

export function listTransitionsForMap(db: Db, mapId: string): TransitionRow[] {
  const rows = db.select().from(mapTransitions)
    .where(eq(mapTransitions.fromMapId, mapId))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function listTransitionsToMap(db: Db, mapId: string): TransitionRow[] {
  const rows = db.select().from(mapTransitions)
    .where(eq(mapTransitions.toMapId, mapId))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function findTransition(
  db: Db,
  fromMapId: string,
  fromAreaId: string,
  toMapId: string,
  toAreaId: string
): TransitionRow | null {
  const row = db.select().from(mapTransitions)
    .where(and(
      eq(mapTransitions.fromMapId, fromMapId),
      eq(mapTransitions.fromAreaId, fromAreaId),
      eq(mapTransitions.toMapId, toMapId),
      eq(mapTransitions.toAreaId, toAreaId)
    ))
    .get() as RawRow | undefined
  return row ? mapRow(row) : null
}

export interface CreateTransitionInput {
  partySeed: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label?: string | null
  bidirectional?: boolean
}

// Verifica che areaId esista nel GeneratedMap della partyMap. Throwa
// transition_invalid se non c'è. Side-effect-free rispetto al DB: legge
// mapType per gli params, poi delega al generator.
function assertAreaExists(db: Db, mapId: string, areaId: string): void {
  const map = findPartyMap(db, mapId)!
  const mapType = findMapType(db, map.mapTypeId)
  if (!mapType) throw new DomainError('map_type_not_found', map.mapTypeId)
  const gm = generate(mapType.id, map.mapSeed, parseDefaultParams(mapType))
  if (!gm.areas.some(a => a.id === areaId)) {
    throw new DomainError('transition_invalid', `area ${areaId} not in map ${mapId}`)
  }
}

function insertRow(
  db: Db,
  partySeed: string,
  fromMapId: string,
  fromAreaId: string,
  toMapId: string,
  toAreaId: string,
  label: string | null,
  now: number
): TransitionRow {
  const row: TransitionRow = {
    id: generateUuid(),
    partySeed,
    fromMapId,
    fromAreaId,
    toMapId,
    toAreaId,
    label,
    createdAt: now
  }
  db.insert(mapTransitions).values(row).run()
  return row
}

export function createTransition(db: Db, input: CreateTransitionInput): TransitionRow[] {
  const fromMap = findPartyMap(db, input.fromMapId)
  const toMap = findPartyMap(db, input.toMapId)
  if (!fromMap || fromMap.partySeed !== input.partySeed) {
    throw new DomainError('not_found', `map ${input.fromMapId}`)
  }
  if (!toMap || toMap.partySeed !== input.partySeed) {
    throw new DomainError('not_found', `map ${input.toMapId}`)
  }

  assertAreaExists(db, input.fromMapId, input.fromAreaId)
  assertAreaExists(db, input.toMapId, input.toAreaId)

  const label = input.label ?? null
  const now = Date.now()
  const direct = insertRow(
    db, input.partySeed,
    input.fromMapId, input.fromAreaId,
    input.toMapId, input.toAreaId,
    label, now
  )
  if (input.bidirectional === false) return [direct]

  const reverse = insertRow(
    db, input.partySeed,
    input.toMapId, input.toAreaId,
    input.fromMapId, input.fromAreaId,
    label, now
  )
  return [direct, reverse]
}

export function deleteTransition(db: Db, transitionId: string): void {
  const row = db.select().from(mapTransitions)
    .where(eq(mapTransitions.id, transitionId))
    .get() as RawRow | undefined
  if (!row) throw new DomainError('not_found', `transition ${transitionId}`)

  // Se esiste lo speculare (fromMapId↔toMapId, fromAreaId↔toAreaId) della
  // stessa party, lo cancelliamo insieme: la creazione bidirezionale è il
  // default, quindi delete simmetrico è la semantica attesa.
  const mirror = db.select().from(mapTransitions)
    .where(and(
      eq(mapTransitions.partySeed, row.partySeed),
      eq(mapTransitions.fromMapId, row.toMapId),
      eq(mapTransitions.fromAreaId, row.toAreaId),
      eq(mapTransitions.toMapId, row.fromMapId),
      eq(mapTransitions.toAreaId, row.fromAreaId)
    ))
    .get() as RawRow | undefined

  db.delete(mapTransitions).where(eq(mapTransitions.id, row.id)).run()
  if (mirror) {
    db.delete(mapTransitions).where(eq(mapTransitions.id, mirror.id)).run()
  }
}
