import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areaVisits } from '~~/server/db/schema'

// v2d-fog: tracking esplorazione party-shared. La prima volta che un
// player entra in un'area di una mappa, registriamo il visit. Tutti i
// player della party vedono come "esplorate" le aree con almeno un
// visit. Il master bypassa il filtro lato client.

export interface VisitRow {
  partySeed: string
  mapId: string
  areaId: string
  firstVisitedBy: string | null
  firstVisitedAt: number
}

// Upsert idempotente: se la riga esiste già, no-op (preserva il primo
// visitatore). Ritorna true se è stato un nuovo discovery.
export function markVisited(
  db: Db,
  partySeed: string,
  mapId: string,
  areaId: string,
  byPlayerId: string
): boolean {
  const existing = db.select().from(areaVisits)
    .where(and(
      eq(areaVisits.partySeed, partySeed),
      eq(areaVisits.mapId, mapId),
      eq(areaVisits.areaId, areaId)
    )).get()
  if (existing) return false
  db.insert(areaVisits).values({
    partySeed,
    mapId,
    areaId,
    firstVisitedBy: byPlayerId,
    firstVisitedAt: Date.now()
  }).run()
  return true
}

export function listVisitedForParty(db: Db, partySeed: string): VisitRow[] {
  return db.select().from(areaVisits)
    .where(eq(areaVisits.partySeed, partySeed))
    .all() as VisitRow[]
}
