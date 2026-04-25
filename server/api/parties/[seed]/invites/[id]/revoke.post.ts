import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { listInvites, revokeInvite } from '~~/server/services/party-invites'
import { DomainError } from '~~/shared/errors'

// v2b: master revoca un invite token. Idempotente sul DB ma 404 se non
// esiste il record per quel seed (evitiamo aggressivamente revoche
// cross-party).
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const id = getRouterParam(event, 'id')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'revoke invite')
    }
    const all = listInvites(db, seed)
    const inv = all.find(i => i.id === id)
    if (!inv) throw new DomainError('not_found', `invite ${id}`)
    revokeInvite(db, id)
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
