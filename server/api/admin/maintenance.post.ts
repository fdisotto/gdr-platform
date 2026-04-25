import { createError, readBody } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { setSetting } from '~~/server/services/system-settings'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

const Body = z.object({
  enabled: z.boolean(),
  message: z.string().min(1).max(500).optional()
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
    setSetting(db, 'system.maintenanceMode', parsed.data.enabled, me.id)
    if (parsed.data.message) {
      setSetting(db, 'system.maintenanceMessage', parsed.data.message, me.id)
    }
    logAdminAction(db, {
      superadminId: me.id,
      action: parsed.data.enabled ? 'maintenance.enable' : 'maintenance.disable',
      targetKind: 'setting',
      targetId: 'system.maintenanceMode',
      payload: parsed.data
    })
    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
