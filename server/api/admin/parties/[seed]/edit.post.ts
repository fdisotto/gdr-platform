import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { parties } from '~~/server/db/schema'
import { findParty } from '~~/server/services/parties'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

const Body = z.object({
  visibility: z.enum(['public', 'private']).optional(),
  joinPolicy: z.enum(['auto', 'request']).optional(),
  cityName: z.string().trim().min(1).max(64).optional()
}).refine(d => d.visibility != null || d.joinPolicy != null || d.cityName != null, {
  message: 'at least one field required'
})

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const seed = getRouterParam(event, 'seed')
    if (!seed) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const raw = await readBody(event)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    const party = findParty(db, seed)
    if (!party) throw createError({ statusCode: 404, statusMessage: 'not_found' })

    const update: Record<string, unknown> = { lastActivityAt: Date.now() }
    if (parsed.data.visibility) update.visibility = parsed.data.visibility
    if (parsed.data.joinPolicy) update.joinPolicy = parsed.data.joinPolicy
    if (parsed.data.cityName) update.cityName = parsed.data.cityName

    db.update(parties).set(update).where(eq(parties.seed, seed)).run()

    logAdminAction(db, {
      superadminId: me.id,
      action: 'party.edit',
      targetKind: 'party',
      targetId: seed,
      payload: parsed.data
    })

    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
