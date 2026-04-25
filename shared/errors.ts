export const ERROR_CODES = [
  'invalid_payload',
  'not_found',
  'forbidden',
  'rate_limited',
  'conflict',
  'muted',
  'banned',
  'area_closed',
  'not_adjacent',
  'master_only',
  'session_invalid',
  'session_superseded',
  'bad_roll_expr',
  // v2a auth
  'invalid_credentials',
  'account_pending',
  'account_banned',
  'username_taken',
  'weak_password',
  'invalid_username',
  'must_reset_first',
  'session_expired',
  'not_member',
  // v2b multi-party
  'private_party',
  'request_required',
  'last_master',
  'member_limit',
  'party_limit',
  'archived',
  'invite_invalid'
] as const

export type ErrorCode = typeof ERROR_CODES[number]

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value)
}

export class DomainError extends Error {
  constructor(public readonly code: ErrorCode, public readonly detail?: string) {
    super(`${code}${detail ? `: ${detail}` : ''}`)
    this.name = 'DomainError'
  }
}
