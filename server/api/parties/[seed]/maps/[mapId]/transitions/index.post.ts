import { createError } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findPartyMap } from '~~/server/services/party-maps'
import { createTransition } from '~~/server/services/map-transitions'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

// v2d: master crea una transizione cross-map. Il `mapId` route param è il
// fromMapId. Default bidirectional=true (default UX: due porte simmetriche),
// con override esplicito per scenari mono-direzionali (es. botola/uscita).

const Body = z.object({
  fromAreaId: z.string().min(1).max(64),
  toMapId: z.string().min(1).max(64),
  toAreaId: z.string().min(1).max(64),
  label: z.string().min(1).max(64).optional(),
  bidirectional: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const mapId = getRouterParam(event, 'mapId')!
    const raw = await readBody(event)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'transitions.create')
    }
    const fromMap = findPartyMap(db, mapId)
    if (!fromMap || fromMap.partySeed !== seed) {
      throw new DomainError('map_not_found', mapId)
    }
    const bidirectional = parsed.data.bidirectional !== false
    const rows = createTransition(db, {
      partySeed: seed,
      fromMapId: mapId,
      fromAreaId: parsed.data.fromAreaId,
      toMapId: parsed.data.toMapId,
      toAreaId: parsed.data.toAreaId,
      label: parsed.data.label ?? null,
      bidirectional
    })
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.create_transition',
      target: mapId,
      payload: {
        fromAreaId: parsed.data.fromAreaId,
        toMapId: parsed.data.toMapId,
        toAreaId: parsed.data.toAreaId,
        label: parsed.data.label ?? null,
        bidirectional,
        createdIds: rows.map(r => r.id)
      }
    })
    return { rows }
  } catch (e) {
    toH3Error(e)
  }
})
