import { getQuery } from 'h3'
import { z } from 'zod'
import { and, eq, isNull, isNotNull, like, or } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { parties, players } from '~~/server/db/schema'
import { listMasters } from '~~/server/services/parties'
import { toH3Error } from '~~/server/utils/http'

const QuerySchema = z.object({
  status: z.enum(['active', 'archived', 'all']).default('all'),
  q: z.string().trim().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
})

interface AdminPartyRow {
  seed: string
  cityName: string
  visibility: 'public' | 'private'
  joinPolicy: 'auto' | 'request'
  archivedAt: number | null
  memberCount: number
  masterDisplays: string[]
  createdAt: number
  lastActivityAt: number
}

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const parsed = QuerySchema.safeParse(getQuery(event))
    if (!parsed.success) {
      const { createError } = await import('h3')
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const { status, q, cursor, limit } = parsed.data
    const db = useDb()

    // Filtro status
    const whereParts: ReturnType<typeof and>[] = []
    if (status === 'active') whereParts.push(isNull(parties.archivedAt))
    else if (status === 'archived') whereParts.push(isNotNull(parties.archivedAt))
    if (q) {
      const like1 = `%${q}%`
      whereParts.push(or(like(parties.cityName, like1), like(parties.seed, like1))!)
    }
    const whereCombined = whereParts.length > 0 ? and(...whereParts) : undefined

    const allRows = (whereCombined
      ? db.select().from(parties).where(whereCombined).all()
      : db.select().from(parties).all()) as Array<{
      seed: string
      cityName: string
      visibility: string
      joinPolicy: string
      archivedAt: number | null
      createdAt: number
      lastActivityAt: number
    }>

    // Ordine desc per lastActivityAt + seed tie-break
    allRows.sort((a, b) =>
      b.lastActivityAt - a.lastActivityAt || a.seed.localeCompare(b.seed)
    )

    let startIdx = 0
    if (cursor) {
      const [tsStr, cseed] = cursor.split(':')
      const ts = Number(tsStr)
      if (Number.isFinite(ts)) {
        startIdx = allRows.findIndex(r =>
          r.lastActivityAt < ts || (r.lastActivityAt === ts && r.seed > (cseed ?? ''))
        )
        if (startIdx < 0) startIdx = allRows.length
      }
    }

    const slice = allRows.slice(startIdx, startIdx + limit)

    const items: AdminPartyRow[] = slice.map((p) => {
      const mAll = db.select({ id: players.id }).from(players)
        .where(and(
          eq(players.partySeed, p.seed),
          isNull(players.leftAt),
          eq(players.isKicked, false)
        )).all()
      const masters = listMasters(db, p.seed)
      return {
        seed: p.seed,
        cityName: p.cityName,
        visibility: p.visibility as 'public' | 'private',
        joinPolicy: p.joinPolicy as 'auto' | 'request',
        archivedAt: p.archivedAt,
        memberCount: mAll.length,
        masterDisplays: masters.map(m => m.nickname),
        createdAt: p.createdAt,
        lastActivityAt: p.lastActivityAt
      }
    })

    const nextCursor = startIdx + limit < allRows.length
      ? `${slice.at(-1)!.lastActivityAt}:${slice.at(-1)!.seed}`
      : null
    return { items, nextCursor }
  } catch (e) {
    toH3Error(e)
  }
})
