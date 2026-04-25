import { and, count, eq, isNull } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { listPartyMaps } from '~~/server/services/party-maps'
import { players, zombies } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

// v2d: lista mappe della party con conteggi (player vivi sulla mappa,
// zombie sulla mappa). Solo i master della party correnti possono leggere.
// I conteggi vengono calcolati con count separati per non costringere a
// JOIN più complessi su SQLite — le mappe per party sono ≤10 (MAX_MAPS_PER_PARTY).

function memberCount(db: Db, mapId: string): number {
  const r = db.select({ c: count() }).from(players)
    .where(and(eq(players.currentMapId, mapId), isNull(players.leftAt)))
    .get()
  return Number(r?.c ?? 0)
}

function zombieCount(db: Db, mapId: string): number {
  const r = db.select({ c: count() }).from(zombies)
    .where(eq(zombies.mapId, mapId))
    .get()
  return Number(r?.c ?? 0)
}

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'maps.list')
    }
    const rows = listPartyMaps(db, seed)
    return rows.map(r => ({
      ...r,
      memberCount: memberCount(db, r.id),
      zombieCount: zombieCount(db, r.id)
    }))
  } catch (e) {
    toH3Error(e)
  }
})
