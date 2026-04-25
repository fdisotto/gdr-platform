import { createError } from 'h3'
import { JoinPartyBody } from '~~/shared/protocol/http'
import { joinParty, listOnlinePlayers } from '~~/server/services/players'
import { partyMustExist, touchParty } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import {
  findActiveByToken, consumeInvite
} from '~~/server/services/party-invites'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const parsed = JoinPartyBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const body = parsed.data
    const db = useDb()
    const party = partyMustExist(db, seed)

    // v2b: gating per visibility/joinPolicy/archived/invite-token.
    if (party.archivedAt != null) {
      throw new DomainError('archived', `party ${seed}`)
    }

    let inviteUsedId: string | null = null
    if (body.inviteToken) {
      // L'invite consente bypass della join-policy ma deve essere valido
      // (non scaduto, non revocato, non già usato) e per la party richiesta.
      const inv = findActiveByToken(db, body.inviteToken)
      if (!inv || inv.partySeed !== seed) {
        throw new DomainError('invite_invalid', 'invalid token')
      }
      inviteUsedId = inv.id
    } else {
      if (party.visibility === 'private') {
        throw new DomainError('private_party', 'invite token required')
      }
      if (party.joinPolicy === 'request') {
        throw new DomainError('request_required', 'use POST /join-requests')
      }
    }

    const player = joinParty(db, seed, body.displayName, { userId: me.id })
    if (inviteUsedId) consumeInvite(db, inviteUsedId, me.id)
    touchParty(db, seed)
    const areasState = listAreasState(db, seed)
    const players = listOnlinePlayers(db, seed)
    return {
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
