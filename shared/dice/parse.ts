export interface DiceTerm {
  count: number
  sides: number
}

export interface DiceExpr {
  terms: DiceTerm[]
  modifier: number
}

export type ParseResult =
  | { ok: true, expr: DiceExpr }
  | { ok: false, error: string }

const TERM_RE = /^(\d+)d(\d+)$/

export function parseRoll(input: string): ParseResult {
  const raw = input.replace(/\s+/g, '')
  if (raw.length === 0) return { ok: false, error: 'empty' }

  const tokens = raw.split(/(?=[+-])/)
  const terms: DiceTerm[] = []
  let modifier = 0

  for (const token of tokens) {
    if (token === '') return { ok: false, error: 'malformed' }
    const sign = token.startsWith('-') ? -1 : 1
    const body = token.replace(/^[+-]/, '')
    if (body === '') return { ok: false, error: 'malformed' }

    const mDice = TERM_RE.exec(body)
    if (mDice) {
      const count = parseInt(mDice[1]!, 10)
      const sides = parseInt(mDice[2]!, 10)
      if (count < 1 || count > 100) return { ok: false, error: 'count_out_of_range' }
      if (sides < 2 || sides > 1000) return { ok: false, error: 'sides_out_of_range' }
      if (sign === -1) return { ok: false, error: 'negative_dice_unsupported' }
      terms.push({ count, sides })
      continue
    }

    if (/^\d+$/.test(body)) {
      modifier += sign * parseInt(body, 10)
      continue
    }

    return { ok: false, error: 'malformed' }
  }

  if (terms.length === 0) return { ok: false, error: 'no_dice' }
  return { ok: true, expr: { terms, modifier } }
}
