import { JoinPartyBody } from '~~/shared/protocol/http'
import { joinParty, listOnlinePlayers } from '~~/server/services/players'
import { partyMustExist, touchParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const body = JoinPartyBody.parse(raw)
    const db = useDb()
    const party = partyMustExist(db, seed)
    const player = joinParty(db, seed, body.nickname)
    touchParty(db, seed)
    const areasState = listAreasState(db, seed)
    const players = listOnlinePlayers(db, seed)
    return {
      sessionToken: player.sessionToken,
      playerId: player.id,
      initialState: {
        party: {
          seed: party.seed,
          cityName: party.cityName,
          createdAt: party.createdAt,
          lastActivityAt: party.lastActivityAt
        },
        me: {
          id: player.id,
          nickname: player.nickname,
          role: player.role,
          currentAreaId: player.currentAreaId
        },
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
