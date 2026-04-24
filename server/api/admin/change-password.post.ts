import { createError, getRequestIP, getHeader } from 'h3'
import { ChangePasswordBody } from '~~/shared/protocol/http'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { hashPassword, verifyPassword, generateSessionToken } from '~~/server/services/auth'
import {
  findSuperadminById,
  updatePassword as updateSaPassword
} from '~~/server/services/superadmins'
import { revokeAllForSuperadmin, createSession } from '~~/server/services/sessions'
import { logAuthEvent } from '~~/server/services/auth-events'
import { setSessionCookie } from '~~/server/utils/session-cookie'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    // allowMustReset: è l'UNICO endpoint admin (con logout) accessibile da
    // un superadmin con mustReset=true.
    const me = await requireSuperadmin(event, { allowMustReset: true })

    const raw = await readBody(event)
    const parsed = ChangePasswordBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const body = parsed.data
    const db = useDb()
    const sa = findSuperadminById(db, me.id)
    if (!sa) {
      throw createError({ statusCode: 401, statusMessage: 'session_expired' })
    }

    const ok = await verifyPassword(body.currentPassword, sa.passwordHash)
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
    updateSaPassword(db, sa.id, newHash)
    revokeAllForSuperadmin(db, sa.id)

    const ip = getRequestIP(event, { xForwardedFor: true }) ?? undefined
    const userAgent = getHeader(event, 'user-agent') ?? undefined
    const newToken = generateSessionToken()
    createSession(db, { token: newToken, superadminId: sa.id, ip, userAgent })
    setSessionCookie(event, newToken)

    logAuthEvent(db, {
      actorKind: 'superadmin',
      actorId: sa.id,
      event: 'password_changed_self',
      ip,
      userAgent
    })

    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
