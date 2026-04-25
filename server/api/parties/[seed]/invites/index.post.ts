import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { createInvite } from '~~/server/services/party-invites'
import { DomainError } from '~~/shared/errors'

// v2b: master genera un invite token monouso (7 giorni). Il client riceve
// id, token e una url relativa pronta per copy-to-clipboard.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'create invite')
    }
    const inv = createInvite(db, { partySeed: seed, createdBy: me.id })
    return {
      id: inv.id,
      token: inv.token,
      url: `/party/${seed}?invite=${inv.token}`,
      expiresAt: inv.expiresAt
    }
  } catch (e) {
    toH3Error(e)
  }
})
