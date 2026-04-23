import type { DiceExpr } from '~~/shared/dice/parse'

export interface TermRollResult {
  count: number
  sides: number
  values: number[]
}

export interface RollResult {
  rolls: TermRollResult[]
  modifier: number
  total: number
}

export function rollDice(expr: DiceExpr, rng: () => number): RollResult {
  const rolls: TermRollResult[] = []
  let total = expr.modifier
  for (const t of expr.terms) {
    const values: number[] = []
    for (let i = 0; i < t.count; i++) {
      const v = Math.floor(rng() * t.sides) + 1
      values.push(v)
      total += v
    }
    rolls.push({ count: t.count, sides: t.sides, values })
  }
  return { rolls, modifier: expr.modifier, total }
}
