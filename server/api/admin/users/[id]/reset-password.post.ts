import { randomBytes } from 'node:crypto'
import { createError, getRouterParam, getRequestIP } from 'h3'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { findUserById, updatePassword, markMustReset } from '~~/server/services/users'
import { hashPassword } from '~~/server/services/auth'
import { revokeAllForUser } from '~~/server/services/sessions'
import { logAuthEvent } from '~~/server/services/auth-events'
import { toH3Error } from '~~/server/utils/http'

// Genera una password temporanea di 12 caratteri base64url — entropia
// sufficiente per il breve periodo prima del forzato change-password.
function generateTempPassword(): string {
  return randomBytes(9).toString('base64url').slice(0, 12)
}

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const db = useDb()
    const user = findUserById(db, id)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'not_found' })

    const tempPassword = generateTempPassword()
    const hash = await hashPassword(tempPassword)
    updatePassword(db, user.id, hash)
    // updatePassword azzera mustReset; dobbiamo esplicitamente rialzarlo.
    markMustReset(db, user.id, true)
    revokeAllForUser(db, user.id)

    const ip = getRequestIP(event, { xForwardedFor: true }) ?? undefined
    logAuthEvent(db, {
      actorKind: 'superadmin',
      actorId: me.id,
      event: 'password_reset_by_admin',
      usernameAttempted: user.username,
      ip,
      detail: user.id
    })
    return { tempPassword }
  } catch (e) {
    toH3Error(e)
  }
})
