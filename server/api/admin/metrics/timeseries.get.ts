import { getQuery } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listDailyMetrics } from '~~/server/services/daily-metrics'
import { toH3Error } from '~~/server/utils/http'

const Query = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30)
})

function isoDay(ms: number): string {
  const d = new Date(ms)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return utc.toISOString().slice(0, 10)
}

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      const { createError } = await import('h3')
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const { days } = parsed.data
    const db = useDb()
    const now = Date.now()
    const fromDate = isoDay(now - days * 86400_000)
    const toDate = isoDay(now)
    const rows = listDailyMetrics(db, fromDate, toDate)
    return { from: fromDate, to: toDate, items: rows }
  } catch (e) {
    toH3Error(e)
  }
})
