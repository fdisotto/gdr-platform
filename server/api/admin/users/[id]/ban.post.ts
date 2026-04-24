import { createError, getRouterParam, getRequestIP } from 'h3'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { BanUserBody } from '~~/shared/protocol/http'
import { findUserById, banUser } from '~~/server/services/users'
import { revokeAllForUser } from '~~/server/services/sessions'
import { logAuthEvent } from '~~/server/services/auth-events'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const raw = await readBody(event).catch(() => ({}))
    const parsed = BanUserBody.safeParse(raw ?? {})
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    const user = findUserById(db, id)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'not_found' })

    banUser(db, user.id, parsed.data.reason ?? null)
    revokeAllForUser(db, user.id)

    const ip = getRequestIP(event, { xForwardedFor: true }) ?? undefined
    logAuthEvent(db, {
      actorKind: 'superadmin',
      actorId: me.id,
      event: 'banned',
      usernameAttempted: user.username,
      ip,
      detail: parsed.data.reason
    })
    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
