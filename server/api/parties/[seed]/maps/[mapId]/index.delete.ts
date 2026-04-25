import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { deletePartyMap, findPartyMap } from '~~/server/services/party-maps'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

// v2d: master elimina una mappa della party. I pre-check (cannot_delete_spawn,
// map_not_empty per players/zombies/transitions entranti) sono nel service.

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'maps.delete')
    }
    const map = findPartyMap(db, mapId)
    if (!map || map.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    deletePartyMap(db, mapId)
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.delete',
      target: mapId,
      payload: { mapTypeId: map.mapTypeId, name: map.name }
    })
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
