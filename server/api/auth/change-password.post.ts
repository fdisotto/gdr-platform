import { createError, getRequestIP, getHeader } from 'h3'
import { ChangePasswordBody } from '~~/shared/protocol/http'
import { useDb } from '~~/server/utils/db'
import { requireUser } from '~~/server/utils/auth-middleware'
import { hashPassword, verifyPassword, generateSessionToken } from '~~/server/services/auth'
import { findUserById, updatePassword } from '~~/server/services/users'
import { revokeAllForUser, createSession } from '~~/server/services/sessions'
import { logAuthEvent } from '~~/server/services/auth-events'
import { setSessionCookie } from '~~/server/utils/session-cookie'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const raw = await readBody(event)
    const parsed = ChangePasswordBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const body = parsed.data
    const db = useDb()
    const user = findUserById(db, me.id)
    if (!user) {
      // Edge case: sessione valida ma user sparito nel frattempo.
      throw createError({ statusCode: 401, statusMessage: 'session_expired' })
    }

    const ok = await verifyPassword(body.currentPassword, user.passwordHash)
    if (!ok) {
      throw createError({ statusCode: 401, statusMessage: 'invalid_credentials' })
    }
    if (body.currentPassword === body.newPassword) {
      throw createError({
        statusCode: 400,
        statusMessage: 'weak_password',
        data: { code: 'weak_password', detail: 'same_as_old' }
      })
    }

    const newHash = await hashPassword(body.newPassword)
    updatePassword(db, user.id, newHash)

    // Revoca TUTTE le sessioni (inclusa la corrente), poi crea una nuova
    // sessione e aggiorna il cookie — così il chiamante continua senza dover
    // rifare login ma tutti gli altri device vengono sloggati.
    revokeAllForUser(db, user.id)
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? undefined
    const userAgent = getHeader(event, 'user-agent') ?? undefined
    const newToken = generateSessionToken()
    createSession(db, { token: newToken, userId: user.id, ip, userAgent })
    setSessionCookie(event, newToken)

    logAuthEvent(db, {
      actorKind: 'user',
      actorId: user.id,
      event: 'password_changed_self',
      ip,
      userAgent
    })

    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
