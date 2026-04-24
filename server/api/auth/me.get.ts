import { createError } from 'h3'
import { readAuthIdentity } from '~~/server/utils/auth-middleware'
import type { MeResponse } from '~~/shared/protocol/http'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event): Promise<MeResponse> => {
  try {
    const identity = await readAuthIdentity(event)
    if (!identity) {
      throw createError({ statusCode: 401, statusMessage: 'session_expired' })
    }
    return {
      kind: identity.kind,
      id: identity.id,
      username: identity.username,
      mustReset: identity.mustReset
    }
  } catch (e) {
    toH3Error(e)
  }
})
