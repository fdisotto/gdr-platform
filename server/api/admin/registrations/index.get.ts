import { createError, getQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listUsersByStatus, type UserStatus } from '~~/server/services/users'
import { toH3Error } from '~~/server/utils/http'

const StatusParam = z.enum(['pending', 'approved', 'banned']).default('pending')

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const q = getQuery(event)
    const parsed = StatusParam.safeParse(q.status ?? 'pending')
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const status: UserStatus = parsed.data
    const db = useDb()
    const rows = listUsersByStatus(db, status)
    // Strip campo sensibile passwordHash prima di rispondere.
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      status: r.status,
      mustReset: r.mustReset,
      createdAt: r.createdAt,
      approvedAt: r.approvedAt,
      approvedBy: r.approvedBy,
      bannedReason: r.bannedReason
    }))
  } catch (e) {
    toH3Error(e)
  }
})
