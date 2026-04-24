import { createError, getRequestIP, getHeader } from 'h3'
import { LoginBody } from '~~/shared/protocol/http'
import { useDb } from '~~/server/utils/db'
import { verifyPassword, generateSessionToken } from '~~/server/services/auth'
import { findUserByUsername } from '~~/server/services/users'
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

    // Rate limit PRIMA del lookup per non rivelare esistenza username.
    const rateKey = `${body.username.toLowerCase()}:${ip}`
    if (!loginRateLimiter.tryHit(rateKey)) {
      throw createError({ statusCode: 429, statusMessage: 'rate_limited' })
    }

    const db = useDb()
    const user = findUserByUsername(db, body.username)
    if (!user) {
      logAuthEvent(db, {
        actorKind: 'anonymous',
        event: 'login_failed',
        usernameAttempted: body.username,
        ip,
        userAgent,
        detail: 'unknown_user'
      })
      throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' })
    }

    const ok = await verifyPassword(body.password, user.passwordHash)
    if (!ok) {
      logAuthEvent(db, {
        actorKind: 'user',
        actorId: user.id,
        event: 'login_failed',
        usernameAttempted: body.username,
        ip,
        userAgent,
        detail: 'wrong_password'
      })
      throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' })
    }

    if (user.status === 'pending') {
      logAuthEvent(db, {
        actorKind: 'user',
        actorId: user.id,
        event: 'login_failed',
        usernameAttempted: body.username,
        ip,
        userAgent,
        detail: 'account_pending'
      })
      throw createError({ statusCode: 403, statusMessage: 'account_pending' })
    }
    if (user.status === 'banned') {
      logAuthEvent(db, {
        actorKind: 'user',
        actorId: user.id,
        event: 'login_failed',
        usernameAttempted: body.username,
        ip,
        userAgent,
        detail: 'account_banned'
      })
      throw createError({ statusCode: 403, statusMessage: 'account_banned' })
    }

    const token = generateSessionToken()
    createSession(db, { token, userId: user.id, ip, userAgent })
    setSessionCookie(event, token)

    // Reset contatore: sessione creata, la finestra non deve più bloccare.
    loginRateLimiter.clear(rateKey)

    logAuthEvent(db, {
      actorKind: 'user',
      actorId: user.id,
      event: 'login',
      usernameAttempted: body.username,
      ip,
      userAgent
    })

    return { mustReset: user.mustReset }
  } catch (e) {
    toH3Error(e)
  }
})
