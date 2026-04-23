import { describe, it, expect } from 'vitest'
import { ERROR_CODES, isErrorCode, type ErrorCode } from '~~/shared/errors'

describe('ERROR_CODES', () => {
  it('contiene tutti i codici attesi', () => {
    const expected = [
      'invalid_payload', 'not_found', 'forbidden', 'rate_limited',
      'conflict', 'muted', 'banned', 'area_closed', 'not_adjacent',
      'master_only', 'session_invalid', 'session_superseded', 'bad_roll_expr'
    ]
    for (const code of expected) {
      expect(ERROR_CODES).toContain(code)
    }
  })

  it('isErrorCode riconosce codici validi', () => {
    expect(isErrorCode('not_found')).toBe(true)
    expect(isErrorCode('conflict')).toBe(true)
  })

  it('isErrorCode rifiuta stringhe non valide', () => {
    expect(isErrorCode('pippo')).toBe(false)
    expect(isErrorCode('')).toBe(false)
  })

  it('ErrorCode è un union literal', () => {
    const x: ErrorCode = 'not_found'
    expect(x).toBe('not_found')
  })
})
