import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areaAccessBans } from '~~/server/db/schema'

export interface AreaClosureRow {
  partySeed: string
  areaId: string
  reason: string | null
}

export function closeArea(db: Db, seed: string, areaId: string, reason: string | null): void {
  // Idempotente: se già chiusa, aggiorna il reason.
  const existing = db.select().from(areaAccessBans)
    .where(and(eq(areaAccessBans.partySeed, seed), eq(areaAccessBans.areaId, areaId)))
    .all()
  if (existing.length > 0) {
    db.update(areaAccessBans)
      .set({ reason })
      .where(and(eq(areaAccessBans.partySeed, seed), eq(areaAccessBans.areaId, areaId)))
      .run()
    return
  }
  db.insert(areaAccessBans).values({
    partySeed: seed,
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
