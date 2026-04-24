import { createError, getRequestIP, setResponseStatus } from 'h3'
import { RegisterBody } from '~~/shared/protocol/http'
import { useDb } from '~~/server/utils/db'
import { hashPassword } from '~~/server/services/auth'
import { insertUser, findUserByUsername } from '~~/server/services/users'
import { logAuthEvent } from '~~/server/services/auth-events'
import { registerRateLimiter } from '~~/server/services/rate-limits'
import { generateUuid } from '~~/server/utils/crypto'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const raw = await readBody(event)
    const parsed = RegisterBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const body = parsed.data
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'

    if (!registerRateLimiter.tryHit(ip)) {
      throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
    }

    const db = useDb()
    const existing = findUserByUsername(db, body.username)
    if (existing) {
      logAuthEvent(db, {
        actorKind: 'anonymous',
        event: 'register',
        usernameAttempted: body.username,
        ip,
        detail: 'username_taken'
      })
      throw createError({ statusCode: 409, statusMessage: 'username_taken' })
    }

    const hash = await hashPassword(body.password)
    const user = insertUser(db, {
      id: generateUuid(),
      username: body.username,
      passwordHash: hash
    })
    logAuthEvent(db, {
      actorKind: 'anonymous',
      event: 'register',
      actorId: user.id,
      usernameAttempted: body.username,
      ip
    })

    setResponseStatus(event, 202)
    return { status: 'pending' as const }
  } catch (e) {
    toH3Error(e)
  }
})
