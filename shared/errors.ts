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
  'bad_roll_expr'
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
