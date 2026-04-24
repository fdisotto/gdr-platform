import { createError } from 'h3'
import { CreatePartyBody } from '~~/shared/protocol/http'
import { createParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listOnlinePlayers } from '~~/server/services/players'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'

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
    const result = await createParty(db, {
      userId: me.id,
      displayName: body.displayName,
      cityName: body.cityName
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
