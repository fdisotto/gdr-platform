import { createError, getQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listAdminActions } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

// Limite default 100, massimo 500. Cursor 'before' = createdAt esclusivo
// per paginazione desc.
const Query = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  before: z.coerce.number().int().nonnegative().optional()
})

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    return listAdminActions(db, parsed.data)
  } catch (e) {
    toH3Error(e)
  }
})
