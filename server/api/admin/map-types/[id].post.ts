import { createError, getRouterParam, readBody } from 'h3'
import { z } from 'zod'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { findMapType, updateMapType, type MapTypePatch } from '~~/server/services/map-types'
import { logAdminAction } from '~~/server/services/admin-actions'
import { toH3Error } from '~~/server/utils/http'
import { DomainError } from '~~/shared/errors'

const Body = z.object({
  enabled: z.boolean().optional(),
  defaultParams: z.record(z.string(), z.unknown()).optional(),
  areaCountMin: z.number().int().min(1).max(100).optional(),
  areaCountMax: z.number().int().min(1).max(100).optional(),
  name: z.string().min(1).max(50).optional(),
  description: z.string().min(1).max(500).optional()
}).refine(
  v => Object.values(v).some(x => x !== undefined),
  { message: 'patch_empty' }
).refine(
  v => v.areaCountMin === undefined || v.areaCountMax === undefined || v.areaCountMin <= v.areaCountMax,
  { message: 'areaCountMin <= areaCountMax' }
)

export default defineEventHandler(async (event) => {
  try {
    const me = await requireSuperadmin(event)
    const id = getRouterParam(event, 'id')
    if (!id) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })

    const raw = await readBody(event)
    const parsed = Body.safeParse(raw)
    if (!parsed.success) {
      throw createError({
        statusCode: 400,
        statusMessage: 'invalid_payload',
        data: { code: 'invalid_payload', detail: parsed.error.issues.map(i => i.message).join('; ') }
      })
    }

    const db = useDb()
    if (!findMapType(db, id)) throw new DomainError('not_found', `map_type ${id}`)

    const patch: MapTypePatch = parsed.data
    updateMapType(db, id, patch)

    logAdminAction(db, {
      superadminId: me.id,
      action: 'map_type.update',
      targetKind: 'map_type',
      targetId: id,
      payload: patch
    })

    return { ok: true as const }
  } catch (e) {
    toH3Error(e)
  }
})
