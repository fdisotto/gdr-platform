import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap } from '~~/server/services/party-maps'
import { updateTransition } from '~~/server/services/map-transitions'
import { logMasterAction } from '~~/server/services/master-actions'
import { mapTransitions } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

interface RawRow {
  id: string
  partySeed: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
}

// v2d: aggiorna una transizione esistente. body { fromAreaId?,
// toMapId?, toAreaId?, label? } — campi opzionali, vengono cambiati
// solo quelli forniti. fromMapId fisso (cambiarla = creare diversa).
// Endpoint mantenuto su path .../rename per backward-compat con UI.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const transitionId = getRouterParam(event, 'transitionId')!
    const body = await readBody<{
      fromAreaId?: string
      toMapId?: string
      toAreaId?: string
      label?: string | null
    }>(event)
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'transitions.update')
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
    const updated = updateTransition(db, seed, transitionId, {
      fromAreaId: body?.fromAreaId,
      toMapId: body?.toMapId,
      toAreaId: body?.toAreaId,
      label: body?.label
    })
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.update_transition',
      target: transitionId,
      payload: {
        from: { fromAreaId: row.fromAreaId, toMapId: row.toMapId, toAreaId: row.toAreaId, label: row.label },
        to: { fromAreaId: updated.fromAreaId, toMapId: updated.toMapId, toAreaId: updated.toAreaId, label: updated.label }
      }
    })
    return { ok: true, transition: updated }
  } catch (e) {
    toH3Error(e)
  }
})
