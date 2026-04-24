import { createError, getRequestIP, getHeader } from 'h3'
import { LoginBody } from '~~/shared/protocol/http'
import { useDb } from '~~/server/utils/db'
import { verifyPassword, generateSessionToken } from '~~/server/services/auth'
import { findSuperadminByUsername } from '~~/server/services/superadmins'
import { createSession } from '~~/server/services/sessions'
import { logAuthEvent } from '~~/server/services/auth-events'
import { loginRateLimiter } from '~~/server/services/rate-limits'
import { setSessionCookie } from '~~/server/utils/session-cookie'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const raw = await readBody(event)
    const parsed = LoginBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const body = parsed.data
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? 'unknown'
    const userAgent = getHeader(event, 'user-agent') ?? undefined

    // Bucket separato dal login utente per evitare collisioni di key.
    const rateKey = `admin:${body.username.toLowerCase()}:${ip}`
    if (!loginRateLimiter.tryHit(rateKey)) {
      throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
    }

    const db = useDb()
    const sa = findSuperadminByUsername(db, body.username)
    if (!sa) {
      logAuthEvent(db, {
        actorKind: 'anonymous',
        event: 'login_failed',
        usernameAttempted: body.username,
        ip,
        userAgent,
        detail: 'unknown_admin'
      })
      throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' })
    }
    const ok = await verifyPassword(body.password, sa.passwordHash)
    if (!ok) {
      logAuthEvent(db, {
        actorKind: 'superadmin',
        actorId: sa.id,
        event: 'login_failed',
        usernameAttempted: body.username,
        ip,
        userAgent,
        detail: 'wrong_password'
      })
      throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' })
    }

    const token = generateSessionToken()
    createSession(db, { token, superadminId: sa.id, ip, userAgent })
    setSessionCookie(event, token)
    loginRateLimiter.clear(rateKey)

    logAuthEvent(db, {
      actorKind: 'superadmin',
      actorId: sa.id,
      event: 'login',
      usernameAttempted: body.username,
      ip,
      userAgent
    })

    return { mustReset: sa.mustReset }
  } catch (e) {
    toH3Error(e)
  }
})
