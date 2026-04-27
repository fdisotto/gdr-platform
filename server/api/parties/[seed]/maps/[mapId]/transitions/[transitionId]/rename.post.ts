import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap } from '~~/server/services/party-maps'
import { updateTransitionLabel } from '~~/server/services/map-transitions'
import { logMasterAction } from '~~/server/services/master-actions'
import { mapTransitions } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

interface RawRow {
  id: string
  partySeed: string
  fromMapId: string
  toMapId: string
  label: string | null
}

// v2d: aggiorna l'etichetta di una transizione esistente. body { label }.
// label vuota / null rimuove l'etichetta.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const transitionId = getRouterParam(event, 'transitionId')!
    const body = await readBody<{ label?: string | null }>(event)
    const label = body?.label ?? null
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'transitions.rename')
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
    updateTransitionLabel(db, transitionId, label)
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.rename_transition',
      target: transitionId,
      payload: { from: row.label, to: label }
    })
    return { ok: true, label }
  } catch (e) {
    toH3Error(e)
  }
})
