import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { listInvites } from '~~/server/services/party-invites'
import { DomainError } from '~~/shared/errors'

// v2b: master legge tutti gli invite della party (anche scaduti/usati/revoked
// per dashboard storico).
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'list invites')
    }
    const items = listInvites(db, seed)
    return { items }
  } catch (e) {
    toH3Error(e)
  }
})
