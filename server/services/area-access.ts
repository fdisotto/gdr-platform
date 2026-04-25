import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areaAccessBans } from '~~/server/db/schema'

export interface AreaClosureRow {
  partySeed: string
  mapId: string | null
  areaId: string
  reason: string | null
}

// v2d: mapId opzionale, propagato sulla colonna nullable (PK ancora
// (partySeed, areaId)). Le query non filtrano per mapId per coerenza con
// la PK attuale; la migration 0006 estenderà.
export function closeArea(
  db: Db, seed: string, areaId: string, reason: string | null, mapId?: string
): void {
  // Idempotente: se già chiusa, aggiorna il reason e mapId.
  const existing = db.select().from(areaAccessBans)
    .where(and(eq(areaAccessBans.partySeed, seed), eq(areaAccessBans.areaId, areaId)))
    .all()
  if (existing.length > 0) {
    db.update(areaAccessBans)
      .set({ reason, mapId: mapId ?? null })
      .where(and(eq(areaAccessBans.partySeed, seed), eq(areaAccessBans.areaId, areaId)))
      .run()
    return
  }
  db.insert(areaAccessBans).values({
    partySeed: seed,
    mapId: mapId ?? null,
    areaId,
    reason
  }).run()
}

export function openArea(db: Db, seed: string, areaId: string): void {
  db.delete(areaAccessBans)
    .where(and(eq(areaAccessBans.partySeed, seed), eq(areaAccessBans.areaId, areaId)))
    .run()
}

export function isAreaClosed(db: Db, seed: string, areaId: string): boolean {
  const rows = db.select().from(areaAccessBans)
    .where(and(eq(areaAccessBans.partySeed, seed), eq(areaAccessBans.areaId, areaId)))
    .all()
  return rows.length > 0
}

export function listClosedAreas(db: Db, seed: string): AreaClosureRow[] {
  return db.select().from(areaAccessBans)
    .where(eq(areaAccessBans.partySeed, seed))
    .all() as AreaClosureRow[]
}
