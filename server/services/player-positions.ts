import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { playerPositions } from '~~/server/db/schema'
import type { PlayerPosition } from '~~/shared/protocol/ws'

type PositionRow = {
  partySeed: string
  mapId: string | null
  playerId: string
  areaId: string
  x: number
  y: number
  setAt: number
}

export function listPartyPositions(db: Db, partySeed: string): PlayerPosition[] {
  const rows = db.select().from(playerPositions)
    .where(eq(playerPositions.partySeed, partySeed))
    .all() as PositionRow[]
  return rows.map(r => ({ playerId: r.playerId, areaId: r.areaId, x: r.x, y: r.y }))
}

// v2d: mapId opzionale; finché la PK è (partySeed, playerId, areaId) la
// colonna serve solo per annotation. La migration 0006 estenderà la PK.
export function upsertPosition(
  db: Db, partySeed: string, playerId: string, areaId: string,
  x: number, y: number, mapId?: string
): void {
  // ON CONFLICT sulle tre PK: (partySeed, playerId, areaId)
  db.insert(playerPositions).values({
    partySeed, mapId: mapId ?? null, playerId, areaId, x, y, setAt: Date.now()
  }).onConflictDoUpdate({
    target: [playerPositions.partySeed, playerPositions.playerId, playerPositions.areaId],
    set: { x, y, setAt: Date.now(), mapId: mapId ?? null }
  }).run()
}

export function deletePositionsForPlayer(db: Db, partySeed: string, playerId: string): void {
  db.delete(playerPositions)
    .where(and(eq(playerPositions.partySeed, partySeed), eq(playerPositions.playerId, playerId)))
    .run()
}
