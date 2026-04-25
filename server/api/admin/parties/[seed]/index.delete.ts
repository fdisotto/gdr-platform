import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { findParty, hardDeleteParty } from '~~/server/services/parties'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

const Body = z.object({
  confirm: z.literal('DELETE')
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
    hardDeleteParty(db, seed)
    logAdminAction(db, {
      superadminId: me.id,
      action: 'party.delete',
      targetKind: 'party',
      targetId: seed,
      payload: { cityName: party.cityName }
    })
    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
