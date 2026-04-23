import { describe, it, expect } from 'vitest'
import { parseRoll } from '~~/shared/dice/parse'

describe('parseRoll', () => {
  it('accetta NdM', () => {
    expect(parseRoll('2d6')).toEqual({
      ok: true,
      expr: { terms: [{ count: 2, sides: 6 }], modifier: 0 }
    })
  })

  it('accetta NdM+K', () => {
    expect(parseRoll('1d20+3')).toEqual({
      ok: true,
      expr: { terms: [{ count: 1, sides: 20 }], modifier: 3 }
    })
  })

  it('accetta NdM-K', () => {
    expect(parseRoll('1d20-5')).toEqual({
      ok: true,
      expr: { terms: [{ count: 1, sides: 20 }], modifier: -5 }
    })
  })

  it('accetta NdM+NdM', () => {
    expect(parseRoll('2d6+1d8')).toEqual({
      ok: true,
      expr: { terms: [{ count: 2, sides: 6 }, { count: 1, sides: 8 }], modifier: 0 }
    })
  })

  it('ignora spazi', () => {
    expect(parseRoll(' 2d6 + 3 ')).toMatchObject({ ok: true })
  })

  it('rifiuta stringhe malformate', () => {
    expect(parseRoll('')).toMatchObject({ ok: false })
    expect(parseRoll('d6')).toMatchObject({ ok: false })
    expect(parseRoll('2d')).toMatchObject({ ok: false })
    expect(parseRoll('2x6')).toMatchObject({ ok: false })
    expect(parseRoll('2d6+')).toMatchObject({ ok: false })
  })

  it('rifiuta numeri fuori range', () => {
    expect(parseRoll('0d6')).toMatchObject({ ok: false })
    expect(parseRoll('101d6')).toMatchObject({ ok: false })
    expect(parseRoll('2d1')).toMatchObject({ ok: false })
    expect(parseRoll('2d1001')).toMatchObject({ ok: false })
  })
})
