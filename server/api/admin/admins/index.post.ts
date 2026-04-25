import { createError, readBody } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { findUserById } from '~~/server/services/users'
import {
  insertSuperadmin, findSuperadminByUsername, findActiveSuperadminByUsername
} from '~~/server/services/superadmins'
import { logAdminAction } from '~~/server/services/admin-actions'
import { generateUuid } from '~~/server/utils/crypto'
import { toH3Error } from '~~/server/utils/http'

const Body = z.object({
  targetUserId: z.string().min(1)
})

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const raw = await readBody(event)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    const user = findUserById(db, parsed.data.targetUserId)
    if (!user) throw createError({ statusCode: 404, statusMessage: 'not_found' })
    if (user.status !== 'approved') {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload', data: { code: 'invalid_payload', detail: 'user not approved' } })
    }

    // Già superadmin attivo con stesso username?
    if (findActiveSuperadminByUsername(db, user.username)) {
      throw createError({ statusCode: 409, statusMessage: 'conflict', data: { code: 'conflict', detail: 'username already superadmin' } })
    }
    // C'è già una row revocata? In quel caso creiamo nuova row con username
    // diverso (suffix) per evitare unique constraint clash.
    let username = user.username
    if (findSuperadminByUsername(db, username)) {
      username = `${username}-${Date.now().toString(36)}`
    }

    const id = generateUuid()
    insertSuperadmin(db, {
      id,
      username,
      passwordHash: user.passwordHash,
      mustReset: false
    })

    logAdminAction(db, {
      superadminId: me.id,
      action: 'admin.elevate',
      targetKind: 'admin',
      targetId: id,
      payload: { fromUserId: user.id, username }
    })

    return { ok: true as const, superadminId: id, username }
  } catch (e) {
    toH3Error(e)
  }
})
