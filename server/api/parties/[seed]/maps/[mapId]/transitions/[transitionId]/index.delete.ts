import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap } from '~~/server/services/party-maps'
import { deleteTransition } from '~~/server/services/map-transitions'
import { logMasterAction } from '~~/server/services/master-actions'
import { mapTransitions } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

// v2d: master elimina una transizione cross-map. Verifica che la riga
// appartenga davvero a (party, fromMapId) per evitare leak: in caso di
// mismatch ritorniamo `not_found` invece di forbidden. Il service cancella
// anche lo speculare quando esiste (semantica delete simmetrico per default
// bidirezionale).

interface RawRow {
  id: string
  partySeed: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
  createdAt: number
}

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const transitionId = getRouterParam(event, 'transitionId')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'transitions.delete')
    }
    const map = findPartyMap(db, mapId)
    if (!map || map.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    const row = db.select().from(mapTransitions)
      .where(eq(mapTransitions.id, transitionId))
      .get() as RawRow | undefined
    if (!row || row.partySeed !== seed || row.fromMapId !== mapId) {
      throw new DomainError('not_found', `transition ${transitionId}`)
    }
    deleteTransition(db, transitionId)
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.delete_transition',
      target: transitionId,
      payload: {
        fromMapId: row.fromMapId,
        fromAreaId: row.fromAreaId,
        toMapId: row.toMapId,
        toAreaId: row.toAreaId
      }
    })
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
