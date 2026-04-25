import { DomainError } from '~~/shared/errors'
import { ZodError } from 'zod'

export function toH3Error(e: unknown): never {
  if (e instanceof DomainError) {
    const statusByCode: Record<string, number> = {
      invalid_payload: 400,
      not_found: 404,
      forbidden: 403,
      master_only: 403,
      rate_limited: 429,
      conflict: 409,
      muted: 403,
      banned: 403,
      area_closed: 409,
      not_adjacent: 409,
      session_invalid: 401,
      session_superseded: 401,
      bad_roll_expr: 400,
      // v2b multi-party: codici dedicati con status semanticamente coerenti.
      private_party: 403,
      request_required: 403,
      last_master: 409,
      member_limit: 429,
      party_limit: 429,
      archived: 410,
      invite_invalid: 403,
      // v2c admin
      maintenance: 503,
      last_admin: 409,
      setting_invalid: 400,
      // v2d multi-map
      map_type_not_found: 404,
      map_not_found: 404,
      map_limit: 429,
      map_not_empty: 409,
      cannot_delete_spawn: 409,
      transition_invalid: 400,
      not_a_transition: 403
    }
    throw createError({
      statusCode: statusByCode[e.code] ?? 400,
      statusMessage: e.code,
      data: { code: e.code, detail: e.detail ?? null }
    })
  }
  if (e instanceof ZodError) {
    throw createError({
      statusCode: 400,
      statusMessage: 'invalid_payload',
      data: { code: 'invalid_payload', detail: e.issues.map(i => i.message).join('; ') }
    })
  }
  throw e
}
