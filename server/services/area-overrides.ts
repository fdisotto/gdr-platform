import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areaOverrides } from '~~/server/db/schema'

// v2d-edit: delta master sulla GeneratedMap. Una riga per (partySeed, mapId,
// areaId). Il client applica gli override quando renderizza: rinomina,
// riposiziona, nasconde aree generate, oppure aggiunge aree custom (slug
// `custom_<uuid>`, shape autoritativa via x/y/w/h).

export interface AreaOverrideRow {
  partySeed: string
  mapId: string
  areaId: string
  customName: string | null
  x: number | null
  y: number | null
  w: number | null
  h: number | null
  removed: boolean
  customAdded: boolean
  createdAt: number
  updatedAt: number
}

interface RawRow extends Omit<AreaOverrideRow, 'removed' | 'customAdded'> {
  removed: boolean | 0 | 1
  customAdded: boolean | 0 | 1
}

function mapRow(r: RawRow): AreaOverrideRow {
  return { ...r, removed: Boolean(r.removed), customAdded: Boolean(r.customAdded) }
}

export function listOverridesForMap(db: Db, partySeed: string, mapId: string): AreaOverrideRow[] {
  const rows = db.select().from(areaOverrides)
    .where(and(eq(areaOverrides.partySeed, partySeed), eq(areaOverrides.mapId, mapId)))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function listOverridesForParty(db: Db, partySeed: string): AreaOverrideRow[] {
  const rows = db.select().from(areaOverrides)
    .where(eq(areaOverrides.partySeed, partySeed))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export interface UpsertOverrideInput {
  partySeed: string
  mapId: string
  areaId: string
  customName?: string | null
  x?: number | null
  y?: number | null
  w?: number | null
  h?: number | null
  removed?: boolean
  customAdded?: boolean
}

// Upsert merge: i campi non specificati restano invariati su una riga
// preesistente, default sulla creazione. Ritorna la riga finale.
export function upsertOverride(db: Db, input: UpsertOverrideInput): AreaOverrideRow {
  const now = Date.now()
  const existing = db.select().from(areaOverrides)
    .where(and(
      eq(areaOverrides.partySeed, input.partySeed),
      eq(areaOverrides.mapId, input.mapId),
      eq(areaOverrides.areaId, input.areaId)
    )).get() as RawRow | undefined
  if (existing) {
    const patch: Partial<AreaOverrideRow> = {}
    if (input.customName !== undefined) patch.customName = input.customName
    if (input.x !== undefined) patch.x = input.x
    if (input.y !== undefined) patch.y = input.y
    if (input.w !== undefined) patch.w = input.w
    if (input.h !== undefined) patch.h = input.h
    if (input.removed !== undefined) patch.removed = input.removed
    if (input.customAdded !== undefined) patch.customAdded = input.customAdded
    db.update(areaOverrides).set({ ...patch, updatedAt: now })
      .where(and(
        eq(areaOverrides.partySeed, input.partySeed),
        eq(areaOverrides.mapId, input.mapId),
        eq(areaOverrides.areaId, input.areaId)
      )).run()
  } else {
    db.insert(areaOverrides).values({
      partySeed: input.partySeed,
      mapId: input.mapId,
      areaId: input.areaId,
      customName: input.customName ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      w: input.w ?? null,
      h: input.h ?? null,
      removed: input.removed ?? false,
      customAdded: input.customAdded ?? false,
      createdAt: now,
      updatedAt: now
    }).run()
  }
  const fresh = db.select().from(areaOverrides)
    .where(and(
      eq(areaOverrides.partySeed, input.partySeed),
      eq(areaOverrides.mapId, input.mapId),
      eq(areaOverrides.areaId, input.areaId)
    )).get() as RawRow
  return mapRow(fresh)
}

// Hard delete dell'override (solo per le aree customAdded equivale a
// "rimuovere l'area dalla mappa"; per le aree generate equivale a
// "ripristinare i valori del generator").
export function deleteOverride(db: Db, partySeed: string, mapId: string, areaId: string): void {
  db.delete(areaOverrides)
    .where(and(
      eq(areaOverrides.partySeed, partySeed),
      eq(areaOverrides.mapId, mapId),
      eq(areaOverrides.areaId, areaId)
    )).run()
}
