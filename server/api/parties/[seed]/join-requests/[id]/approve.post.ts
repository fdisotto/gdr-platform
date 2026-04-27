import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import {
  isMaster, listMasters, partyMustExist, touchParty
} from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import {
  approveRequest, findRequest, rejectRequest
} from '~~/server/services/party-join-requests'
import { listEnabledAutoDmsForTrigger } from '~~/server/services/auto-dms'
import { insertMessage } from '~~/server/services/messages'
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
    let joined
    try {
      joined = joinParty(db, seed, req.displayName, { userId: req.userId })
    } catch (e) {
      if (e instanceof DomainError && e.code === 'conflict') {
        // Auto-rifiuta la richiesta per sbloccare la coda.
        rejectRequest(db, id, me.id, `displayName conflict: ${req.displayName}`)
      }
      throw e
    }
    approveRequest(db, id, me.id)
    touchParty(db, seed)

    // Auto-DM on_join: stesso hook del join diretto, vale anche quando il
    // master approva manualmente la richiesta. Sender = primo master.
    const autoDms = listEnabledAutoDmsForTrigger(db, seed, 'on_join')
    if (autoDms.length > 0) {
      const sender = listMasters(db, seed)[0]
      if (sender) {
        for (const dm of autoDms) {
          insertMessage(db, {
            partySeed: seed,
            kind: 'dm',
            authorPlayerId: sender.id,
            authorDisplay: sender.nickname,
            targetPlayerId: joined.id,
            body: dm.body,
            subject: dm.subject
          })
        }
      }
    }

    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
