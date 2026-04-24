import { createError, getQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listAuthEvents } from '~~/server/services/auth-events'
import { toH3Error } from '~~/server/utils/http'

// Limite default 100, massimo 500 per evitare dump enormi da browser.
const LimitParam = z.coerce.number().int().min(1).max(500).default(100)

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const q = getQuery(event)
    const parsed = LimitParam.safeParse(q.limit ?? 100)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    return listAuthEvents(db, parsed.data)
  } catch (e) {
    toH3Error(e)
  }
})
