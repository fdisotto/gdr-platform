import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { listRequests } from '~~/server/services/party-join-requests'
import { DomainError } from '~~/shared/errors'

// v2b: master legge la coda delle richieste pending della party.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'list join requests')
    }
    const items = listRequests(db, seed, 'pending')
    return { items }
  } catch (e) {
    toH3Error(e)
  }
})
