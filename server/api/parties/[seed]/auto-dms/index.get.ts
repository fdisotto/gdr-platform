import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { listAutoDms } from '~~/server/services/auto-dms'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'auto_dms.list')
    }
    return { items: listAutoDms(db, seed) }
  } catch (e) {
    toH3Error(e)
  }
})
