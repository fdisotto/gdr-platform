import { and, count, eq, isNull } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap } from '~~/server/services/party-maps'
import { findMapType, parseDefaultParams } from '~~/server/services/map-types'
import { findPlayerByUserInParty } from '~~/server/services/players'
import { generate } from '~~/shared/map/generators'
import { players, zombies } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

// v2d: dettaglio di una mappa della party con il GeneratedMap già renderizzato
// (areas, adjacency, spawn, edges, background). Accessibile sia ai master sia
// ai member della party — i player devono poter leggere la propria mappa per
// renderizzarla. Conteggi inline come in /maps GET (T11).

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
    const mapId = getRouterParam(event, 'mapId')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id) && !findPlayerByUserInParty(db, seed, me.id)) {
      throw new DomainError('not_member', 'maps.detail')
    }
    const map = findPartyMap(db, mapId)
    if (!map || map.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    const mapType = findMapType(db, map.mapTypeId)
    if (!mapType) throw new DomainError('map_type_not_found', map.mapTypeId)
    const generatedMap = generate(mapType.id, map.mapSeed, parseDefaultParams(mapType))
    return {
      ...map,
      memberCount: memberCount(db, map.id),
      zombieCount: zombieCount(db, map.id),
      generatedMap
    }
  } catch (e) {
    toH3Error(e)
  }
})
