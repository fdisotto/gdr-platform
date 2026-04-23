import { CreatePartyBody } from '~~/shared/protocol/http'
import { createParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listOnlinePlayers } from '~~/server/services/players'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const raw = await readBody(event)
    const body = CreatePartyBody.parse(raw)
    const db = useDb()
    const result = await createParty(db, body)
    const areasState = listAreasState(db, result.seed)
    const players = listOnlinePlayers(db, result.seed)
    return {
      seed: result.seed,
      masterToken: result.masterToken,
      sessionToken: result.sessionToken,
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
