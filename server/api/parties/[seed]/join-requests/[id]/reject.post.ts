import { createError } from 'h3'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import {
  findRequest, rejectRequest
} from '~~/server/services/party-join-requests'
import { RejectRequestBody } from '~~/shared/protocol/http'
import { DomainError } from '~~/shared/errors'

// v2b: master rifiuta una richiesta pending con motivo opzionale.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const id = getRouterParam(event, 'id')!
    const raw = await readBody(event)
    const parsed = RejectRequestBody.safeParse(raw ?? {})
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'reject request')
    }
    const req = findRequest(db, id)
    if (!req || req.partySeed !== seed) {
      throw new DomainError('not_found', `join request ${id}`)
    }
    if (req.status !== 'pending') {
      throw new DomainError('conflict', `not pending (${req.status})`)
    }
    rejectRequest(db, id, me.id, parsed.data.reason)
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
