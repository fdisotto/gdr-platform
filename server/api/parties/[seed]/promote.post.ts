import { createError } from 'h3'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { promoteToMaster } from '~~/server/services/players'
import { PromoteBody } from '~~/shared/protocol/http'
import { DomainError } from '~~/shared/errors'

// v2b: master promuove un membro a master. L'audit log è scritto dal service.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const parsed = PromoteBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'promote')
    }
    promoteToMaster(db, seed, parsed.data.targetUserId, me.id)
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
