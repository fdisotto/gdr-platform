import { createError } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { createPartyMap } from '~~/server/services/party-maps'
import { findMapType } from '~~/server/services/map-types'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

// v2d: master crea una nuova istanza di mappa nella party. Il limite
// (default 10) è applicato dal service. I parametri di generazione vengono
// presi dal map_type.defaultParams: per ora niente override per istanza.

const Body = z.object({
  mapTypeId: z.string().min(1).max(32),
  mapSeed: z.string().min(1).max(64).optional(),
  name: z.string().min(1).max(32),
  isSpawn: z.boolean().optional()
})

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'maps.create')
    }
    const mapType = findMapType(db, parsed.data.mapTypeId)
    if (!mapType || !mapType.enabled) {
      throw new DomainError('map_type_not_found', parsed.data.mapTypeId)
    }
    const row = createPartyMap(db, {
      partySeed: seed,
      mapTypeId: parsed.data.mapTypeId,
      mapSeed: parsed.data.mapSeed,
      name: parsed.data.name,
      isSpawn: parsed.data.isSpawn
    })
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'map.create',
      target: row.id,
      payload: {
        mapTypeId: parsed.data.mapTypeId,
        name: parsed.data.name,
        isSpawn: parsed.data.isSpawn === true,
        mapSeed: row.mapSeed
      }
    })
    return { ...row, memberCount: 0, zombieCount: 0 }
  } catch (e) {
    toH3Error(e)
  }
})
