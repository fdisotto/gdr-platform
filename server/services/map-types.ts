import { asc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { mapTypes } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

// v2d: catalogo dei tipi di mappa generabili. Lettura semplice, niente cache
// process-locale per ora — il superadmin aggiorna queste righe raramente
// e ogni read è una select su <10 righe. YAGNI.

export interface MapTypeRow {
  id: string
  name: string
  description: string
  defaultParams: string
  areaCountMin: number
  areaCountMax: number
  enabled: boolean
  createdAt: number
  updatedAt: number
}

export interface MapTypePatch {
  enabled?: boolean
  defaultParams?: Record<string, unknown>
  areaCountMin?: number
  areaCountMax?: number
  name?: string
  description?: string
}

interface RawRow {
  id: string
  name: string
  description: string
  defaultParams: string
  areaCountMin: number
  areaCountMax: number
  // drizzle ritorna 0 | 1 quando legge integer mode:'boolean' senza mappa
  // diretta; coercizziamo via Boolean() per uniformità.
  enabled: boolean | 0 | 1
  createdAt: number
  updatedAt: number
}

function mapRow(r: RawRow): MapTypeRow {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    defaultParams: r.defaultParams,
    areaCountMin: r.areaCountMin,
    areaCountMax: r.areaCountMax,
    enabled: Boolean(r.enabled),
    createdAt: r.createdAt,
    updatedAt: r.updatedAt
  }
}

export function listMapTypes(db: Db): MapTypeRow[] {
  const rows = db.select().from(mapTypes).orderBy(asc(mapTypes.id)).all() as RawRow[]
  return rows.map(mapRow)
}

export function listEnabledMapTypes(db: Db): MapTypeRow[] {
  const rows = db.select().from(mapTypes)
    .where(eq(mapTypes.enabled, true))
    .orderBy(asc(mapTypes.id))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function findMapType(db: Db, id: string): MapTypeRow | null {
  const row = db.select().from(mapTypes).where(eq(mapTypes.id, id)).get() as RawRow | undefined
  return row ? mapRow(row) : null
}

export function updateMapType(db: Db, id: string, patch: MapTypePatch): void {
  const existing = db.select().from(mapTypes).where(eq(mapTypes.id, id)).get() as RawRow | undefined
  if (!existing) throw new DomainError('not_found', `map_type ${id}`)

  const set: Record<string, unknown> = { updatedAt: Date.now() }
  if (patch.enabled !== undefined) set.enabled = patch.enabled
  if (patch.defaultParams !== undefined) set.defaultParams = JSON.stringify(patch.defaultParams)
  if (patch.areaCountMin !== undefined) set.areaCountMin = patch.areaCountMin
  if (patch.areaCountMax !== undefined) set.areaCountMax = patch.areaCountMax
  if (patch.name !== undefined) set.name = patch.name
  if (patch.description !== undefined) set.description = patch.description

  db.update(mapTypes).set(set).where(eq(mapTypes.id, id)).run()
}

export function parseDefaultParams(row: MapTypeRow): Record<string, unknown> {
  try {
    const parsed = JSON.parse(row.defaultParams)
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>
    }
    return {}
  } catch {
    return {}
  }
}
