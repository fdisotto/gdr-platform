import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { partyMustExist } from '~~/server/services/parties'
import {
  cancelRequest, findRequest
} from '~~/server/services/party-join-requests'
import { DomainError } from '~~/shared/errors'

// v2b: il richiedente cancella la propria richiesta pending. Self-only:
// il service rigetta con forbidden se userId != owner.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const id = getRouterParam(event, 'id')!
    const db = useDb()
    partyMustExist(db, seed)
    const req = findRequest(db, id)
    if (!req || req.partySeed !== seed) {
      throw new DomainError('not_found', `join request ${id}`)
    }
    cancelRequest(db, id, me.id)
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
