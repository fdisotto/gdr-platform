import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap, renamePartyMap } from '~~/server/services/party-maps'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

// v2d: master rinomina una mappa della party. body { name: string }.
// Persistito su partyMaps.name; la lista mappe verra' ri-fetcha dal
// client dopo la response (non c'e' broadcast WS dedicato per ora —
// il rename e' un cambio editoriale, non runtime-critico).
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const body = await readBody<{ name?: string }>(event)
    const name = (body?.name ?? '').trim()
    if (!name) {
      throw new DomainError('invalid_payload', 'empty_name')
    }
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'maps.rename')
    }
    const map = findPartyMap(db, mapId)
    if (!map || map.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    renamePartyMap(db, seed, mapId, name)
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.rename',
      target: mapId,
      payload: { from: map.name, to: name.slice(0, 64) }
    })
    return { ok: true, name: name.slice(0, 64) }
  } catch (e) {
    toH3Error(e)
  }
})
