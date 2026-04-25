import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap, setSpawnMap } from '~~/server/services/party-maps'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

// v2d: master designa una mappa come spawn (entry point per nuovi player).
// Il service garantisce che ci sia esattamente una mappa con isSpawn=true
// per party.

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'maps.set_spawn')
    }
    const map = findPartyMap(db, mapId)
    if (!map || map.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    setSpawnMap(db, seed, mapId)
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.set_spawn',
      target: mapId,
      payload: { mapTypeId: map.mapTypeId, name: map.name }
    })
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
