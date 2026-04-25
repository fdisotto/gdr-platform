import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import {
  findActiveSuperadminById, countActiveSuperadmins, revokeSuperadmin
} from '~~/server/services/superadmins'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

const Body = z.object({
  reason: z.string().trim().max(500).optional()
}).optional()

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const raw = await readBody(event).catch(() => undefined)
    const parsed = Body.safeParse(raw ?? undefined)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    const sa = findActiveSuperadminById(db, id)
    if (!sa) throw createError({ statusCode: 404, statusMessage: 'not_found' })

    if (countActiveSuperadmins(db) <= 1) {
      throw createError({
        statusCode: 409,
        statusMessage: 'last_admin',
        data: { code: 'last_admin', detail: 'cannot revoke last active superadmin' }
      })
    }

    revokeSuperadmin(db, id, me.id)

    logAdminAction(db, {
      superadminId: me.id,
      action: 'admin.revoke',
      targetKind: 'admin',
      targetId: id,
      payload: parsed.data ?? null
    })

    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
