import { describe, it, expect, beforeEach } from 'vitest'
import { createRateLimiter } from '~~/server/ws/rate-limit'

describe('rate limiter', () => {
  let limiter: ReturnType<typeof createRateLimiter>
  beforeEach(() => {
    limiter = createRateLimiter({ windowMs: 1000, maxHits: 3 })
  })

  it('consente le prime N hits', () => {
    const now = 1000
    expect(limiter.tryHit('k', now)).toBe(true)
    expect(limiter.tryHit('k', now + 10)).toBe(true)
    expect(limiter.tryHit('k', now + 20)).toBe(true)
  })

  it('blocca dopo N', () => {
    const now = 1000
    limiter.tryHit('k', now)
    limiter.tryHit('k', now + 10)
    limiter.tryHit('k', now + 20)
    expect(limiter.tryHit('k', now + 30)).toBe(false)
  })

  it('libera dopo la finestra', () => {
    const now = 1000
    for (let i = 0; i < 3; i++) limiter.tryHit('k', now + i)
    expect(limiter.tryHit('k', now + 1200)).toBe(true)
  })

  it('chiavi diverse sono indipendenti', () => {
    const now = 1000
    for (let i = 0; i < 3; i++) limiter.tryHit('a', now)
    expect(limiter.tryHit('a', now)).toBe(false)
    expect(limiter.tryHit('b', now)).toBe(true)
  })

  it('clear azzera la chiave', () => {
    const now = 1000
    for (let i = 0; i < 3; i++) limiter.tryHit('k', now)
    limiter.clear('k')
    expect(limiter.tryHit('k', now)).toBe(true)
  })
})
