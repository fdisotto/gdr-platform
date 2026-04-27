import { createError } from 'h3'
import { count } from 'drizzle-orm'
import { CreatePartyBody } from '~~/shared/protocol/http'
import { createParty, countActivePartiesForUser } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listOnlinePlayers } from '~~/server/services/players'
import { parties } from '~~/server/db/schema'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { DomainError } from '~~/shared/errors'
import { MAX_PARTIES_PER_USER, MAX_TOTAL_PARTIES } from '~~/shared/limits'
import { getSettingNumber } from '~~/server/services/system-settings'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const raw = await readBody(event)
    const parsed = CreatePartyBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const body = parsed.data
    const db = useDb()

    // v2c: limiti runtime da system_settings con fallback su limits.ts.
    const maxPartiesPerUser = getSettingNumber(db, 'limits.maxPartiesPerUser', MAX_PARTIES_PER_USER)
    const maxTotalParties = getSettingNumber(db, 'limits.maxTotalParties', MAX_TOTAL_PARTIES)
    const myActive = countActivePartiesForUser(db, me.id)
    if (myActive >= maxPartiesPerUser) {
      throw new DomainError('party_limit', `max ${maxPartiesPerUser} per user`)
    }
    const totalRow = db.select({ c: count() }).from(parties).all() as { c: number }[]
    const total = totalRow[0]?.c ?? 0
    if (total >= maxTotalParties) {
      throw new DomainError('party_limit', `max ${maxTotalParties} total`)
    }

    const result = await createParty(db, {
      userId: me.id,
      displayName: body.displayName,
      cityName: body.cityName,
      mapName: body.mapName,
      mapTypeId: body.mapTypeId,
      visibility: body.visibility,
      joinPolicy: body.joinPolicy
    })
    const areasState = listAreasState(db, result.seed)
    const players = listOnlinePlayers(db, result.seed)
    return {
      seed: result.seed,
      // masterToken resta per compatibilità storica (reclaim legacy non più
      // esposto come endpoint, ma il token è generato e hashato in DB);
      // il client v2a lo ignora. sessionToken NON è più in response: la
      // sessione user viaggia via cookie gdr_session httpOnly.
      masterToken: result.masterToken,
      playerId: result.masterPlayer.id,
      initialState: {
        party: {
          seed: result.seed,
          cityName: result.cityState.cityName,
          createdAt: Date.now(),
          lastActivityAt: Date.now()
        },
        me: result.masterPlayer,
        players,
        areasState,
        messagesByArea: {},
        dms: [],
        serverTime: Date.now()
      }
    }
  } catch (e) {
    toH3Error(e)
  }
})
