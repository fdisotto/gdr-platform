import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import {
  isMaster, partyMustExist, touchParty
} from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import {
  approveRequest, findRequest, rejectRequest
} from '~~/server/services/party-join-requests'
import { DomainError } from '~~/shared/errors'

// v2b: master approva una richiesta. Internamente invoca joinParty con i
// dati della request. Se il displayName richiesto va in conflict con altro
// player, marchiamo la request come rejected (con reason esplicita) per
// evitare che resti pending bloccante e ritorniamo 409 al chiamante.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const id = getRouterParam(event, 'id')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'approve request')
    }
    const req = findRequest(db, id)
    if (!req || req.partySeed !== seed) {
      throw new DomainError('not_found', `join request ${id}`)
    }
    if (req.status !== 'pending') {
      throw new DomainError('conflict', `not pending (${req.status})`)
    }
    try {
      joinParty(db, seed, req.displayName, { userId: req.userId })
    } catch (e) {
      if (e instanceof DomainError && e.code === 'conflict') {
        // Auto-rifiuta la richiesta per sbloccare la coda.
        rejectRequest(db, id, me.id, `displayName conflict: ${req.displayName}`)
      }
      throw e
    }
    approveRequest(db, id, me.id)
    touchParty(db, seed)
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
