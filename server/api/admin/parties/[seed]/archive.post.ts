import { createError, getRouterParam } from 'h3'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { findParty, archiveParty } from '~~/server/services/parties'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const seed = getRouterParam(event, 'seed')
    if (!seed) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const db = useDb()
    const party = findParty(db, seed)
    if (!party) throw createError({ statusCode: 404, statusMessage: 'not_found' })
    if (party.archivedAt != null) {
      // idempotente: nessun cambio
      return { ok: true as const, alreadyArchived: true }
    }
    archiveParty(db, seed)
    logAdminAction(db, {
      superadminId: me.id,
      action: 'party.archive',
      targetKind: 'party',
      targetId: seed
    })
    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
