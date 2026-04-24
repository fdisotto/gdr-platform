import { createError, getRouterParam, getRequestIP } from 'h3'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { RejectRegistrationBody } from '~~/shared/protocol/http'
import { findUserById, rejectUser } from '~~/server/services/users'
import { logAuthEvent } from '~~/server/services/auth-events'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const raw = await readBody(event).catch(() => ({}))
    const parsed = RejectRegistrationBody.safeParse(raw ?? {})
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    const user = findUserById(db, id)
    if (!user) {
      // Reject è idempotente sull'esito: "utente sparito" = ok.
      return { ok: true as const }
    }
    // rejectUser elimina solo se pending; approved/banned non vengono toccati.
    rejectUser(db, user.id)
    const ip = getRequestIP(event, { xForwardedFor: true }) ?? undefined
    logAuthEvent(db, {
      actorKind: 'superadmin',
      actorId: me.id,
      event: 'register_rejected',
      usernameAttempted: user.username,
      ip,
      detail: parsed.data.reason
    })
    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
