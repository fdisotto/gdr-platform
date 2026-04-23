import { describe, it, expect } from 'vitest'
import { rollDice } from '~~/shared/dice/roll'
import { parseRoll } from '~~/shared/dice/parse'
import { mulberry32 } from '~~/shared/seed/prng'

function mustParse(expr: string) {
  const r = parseRoll(expr)
  if (!r.ok) throw new Error('parse failed')
  return r.expr
}

describe('rollDice', () => {
  it('rispetta i range per singolo dado', () => {
    const rng = mulberry32(1)
    for (let i = 0; i < 200; i++) {
      const r = rollDice(mustParse('1d6'), rng)
      expect(r.total).toBeGreaterThanOrEqual(1)
      expect(r.total).toBeLessThanOrEqual(6)
      expect(r.rolls).toHaveLength(1)
    }
  })

  it('applica il modifier', () => {
    const rng = mulberry32(2)
    const r = rollDice(mustParse('1d6+10'), rng)
    expect(r.total).toBe(r.rolls[0].values[0] + 10)
    expect(r.modifier).toBe(10)
  })

  it('somma più termini', () => {
    const rng = mulberry32(3)
    const r = rollDice(mustParse('2d6+1d8'), rng)
    const sum = r.rolls.flatMap(x => x.values).reduce((a, b) => a + b, 0)
    expect(r.total).toBe(sum)
  })

  it('è deterministico con stessa RNG', () => {
    const a = rollDice(mustParse('3d6+2'), mulberry32(99))
    const b = rollDice(mustParse('3d6+2'), mulberry32(99))
    expect(a).toEqual(b)
  })
})
