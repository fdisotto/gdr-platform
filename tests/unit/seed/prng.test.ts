import { describe, it, expect } from 'vitest'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

describe('mulberry32', () => {
  it('produce stessa sequenza con stesso seed', () => {
    const a = mulberry32(42)
    const b = mulberry32(42)
    for (let i = 0; i < 10; i++) {
      expect(a()).toBe(b())
    }
  })

  it('produce sequenze diverse con seed diversi', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    const seqA = Array.from({ length: 5 }, () => a())
    const seqB = Array.from({ length: 5 }, () => b())
    expect(seqA).not.toEqual(seqB)
  })

  it('output in [0, 1)', () => {
    const rng = mulberry32(7)
    for (let i = 0; i < 1000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('seedFromString', () => {
  it('è deterministico', () => {
    expect(seedFromString('hello')).toBe(seedFromString('hello'))
  })

  it('differenzia stringhe diverse', () => {
    expect(seedFromString('a')).not.toBe(seedFromString('b'))
  })

  it('produce un intero 32-bit', () => {
    const v = seedFromString('some-uuid-here')
    expect(Number.isInteger(v)).toBe(true)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(2 ** 32)
  })
})
