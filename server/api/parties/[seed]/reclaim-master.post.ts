import { ReclaimMasterBody } from '~~/shared/protocol/http'
import { verifyMaster, partyMustExist, touchParty } from '~~/server/services/parties'
import { findMaster, rotateSessionToken, touchPlayer, listOnlinePlayers } from '~~/server/services/players'
import { listAreasState } from '~~/server/services/areas'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const body = ReclaimMasterBody.parse(raw)
    const db = useDb()
    const party = partyMustExist(db, seed)
    const ok = await verifyMaster(db, seed, body.masterToken)
    if (!ok) {
      throw new DomainError('forbidden', 'invalid_master_token')
    }

    const master = findMaster(db, seed)
    if (!master) {
      throw new DomainError('not_found', 'master_player_missing')
    }

    const sessionToken = rotateSessionToken(db, master.id)
    touchPlayer(db, master.id)
    touchParty(db, seed)

    const areasState = listAreasState(db, seed)
    const players = listOnlinePlayers(db, seed)

    return {
      sessionToken,
      playerId: master.id,
      initialState: {
        party: {
          seed: party.seed,
          cityName: party.cityName,
          createdAt: party.createdAt,
          lastActivityAt: party.lastActivityAt
        },
        me: {
          id: master.id,
          nickname: master.nickname,
          role: master.role,
          currentAreaId: master.currentAreaId
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
