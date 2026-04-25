import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap } from '~~/server/services/party-maps'
import { findPlayerByUserInParty } from '~~/server/services/players'
import {
  listTransitionsForMap, listTransitionsToMap
} from '~~/server/services/map-transitions'
import { DomainError } from '~~/shared/errors'

// v2d: lista delle transizioni cross-map della mappa. Master e member possono
// leggerle: i player ne hanno bisogno per il click cross-map dalla view.
// Restituisce outgoing (fromMapId = questa) e incoming (toMapId = questa) in
// modo che il frontend possa rappresentare entrambe le direzioni.

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id) && !findPlayerByUserInParty(db, seed, me.id)) {
      throw new DomainError('not_member', 'transitions.list')
    }
    const map = findPartyMap(db, mapId)
    if (!map || map.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    return {
      outgoing: listTransitionsForMap(db, mapId),
      incoming: listTransitionsToMap(db, mapId)
    }
  } catch (e) {
    toH3Error(e)
  }
})
