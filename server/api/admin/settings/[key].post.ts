import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { setSetting } from '~~/server/services/system-settings'
import { invalidateRateLimiters } from '~~/server/services/rate-limits'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'

// Schema per chiave nota: limita range/tipo. Le chiavi sconosciute sono
// rifiutate con 400 setting_invalid (white-list).
const KEY_SCHEMAS: Record<string, z.ZodType> = {
  'limits.maxPartiesPerUser': z.number().int().min(1).max(50),
  'limits.maxMembersPerParty': z.number().int().min(1).max(500),
  'limits.maxTotalParties': z.number().int().min(1).max(10000),
  'limits.partyInactivityArchiveDays': z.number().int().min(1).max(365),
  'limits.inviteTtlDays': z.number().int().min(1).max(60),
  'limits.loginRateMaxFailures': z.number().int().min(1).max(100),
  'limits.loginRateWindowMinutes': z.number().int().min(1).max(1440),
  'limits.registerRateMaxPerHour': z.number().int().min(1).max(100),
  'features.registrationEnabled': z.boolean(),
  'features.partyCreationEnabled': z.boolean(),
  'features.voiceChatEnabled': z.boolean(),
  'features.mapTransitionsEnabled': z.boolean(),
  'limits.maxMapsPerParty': z.number().int().min(1).max(50),
  'system.maintenanceMode': z.boolean(),
  'system.maintenanceMessage': z.string().min(1).max(500)
}

const Body = z.object({
  value: z.unknown()
})

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const key = getRouterParam(event, 'key')
    if (!key) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const schema = KEY_SCHEMAS[key]
    if (!schema) {
      throw createError({
        statusCode: 400,
        statusMessage: 'setting_invalid',
        data: { code: 'setting_invalid', detail: `unknown key ${key}` }
      })
    }

    const raw = await readBody(event)
    const parsedBody = Body.safeParse(raw)
    if (!parsedBody.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const valueParsed = schema.safeParse(parsedBody.data.value)
    if (!valueParsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'setting_invalid',
        data: {
          code: 'setting_invalid',
          detail: valueParsed.error.issues.map(i => i.message).join('; ')
        }
      })
    }

    const db = useDb()
    setSetting(db, key, valueParsed.data, me.id)
    if (key.startsWith('limits.login') || key.startsWith('limits.register')) {
      invalidateRateLimiters()
    }

    logAdminAction(db, {
      superadminId: me.id,
      action: 'setting.update',
      targetKind: 'setting',
      targetId: key,
      payload: { value: valueParsed.data }
    })

    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
