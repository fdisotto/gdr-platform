import { describe, it, expect } from 'vitest'
import {
  AREAS, AREA_IDS, ADJACENCY, isAreaId, areAdjacent, reachableFrom
} from '~~/shared/map/areas'

describe('AREAS catalog', () => {
  it('contiene esattamente 14 aree', () => {
    expect(AREAS).toHaveLength(14)
  })

  it('ogni area ha id, name e svg metadata', () => {
    for (const a of AREAS) {
      expect(a.id).toMatch(/^[a-z_]+$/)
      expect(a.name.length).toBeGreaterThan(0)
      expect(a.svg).toMatchObject({
        x: expect.any(Number),
        y: expect.any(Number),
        w: expect.any(Number),
        h: expect.any(Number)
      })
    }
  })

  it('id univoci', () => {
    const ids = AREAS.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('isAreaId discrimina', () => {
    // Legacy ids accettati come prima.
    expect(isAreaId('piazza')).toBe(true)
    // Generic slug accettato (post-v2d: aree generate hanno slug stabili
    // come `chiesa_3`, `bunker_2`).
    expect(isAreaId('chiesa_3')).toBe(true)
    // Non-string o malformed → falso.
    expect(isAreaId('Foo Bar')).toBe(false)
    expect(isAreaId('123_no_letter_first')).toBe(false)
    expect(isAreaId('')).toBe(false)
    expect(isAreaId(42)).toBe(false)
  })
})

describe('ADJACENCY', () => {
  it('copre tutte le aree', () => {
    for (const id of AREA_IDS) {
      expect(ADJACENCY[id]).toBeDefined()
    }
  })

  it('è simmetrica', () => {
    for (const a of AREA_IDS) {
      for (const b of ADJACENCY[a]) {
        expect(ADJACENCY[b]).toContain(a)
      }
    }
  })

  it('nessuna area adiacente a se stessa', () => {
    for (const id of AREA_IDS) {
      expect(ADJACENCY[id]).not.toContain(id)
    }
  })

  it('areAdjacent funziona in entrambe le direzioni', () => {
    expect(areAdjacent('piazza', 'chiesa')).toBe(true)
    expect(areAdjacent('chiesa', 'piazza')).toBe(true)
    expect(areAdjacent('piazza', 'rifugio')).toBe(false)
  })
})

describe('connettività', () => {
  it('ogni area è raggiungibile da piazza entro 6 hop', () => {
    const reachable = reachableFrom('piazza', 6)
    for (const id of AREA_IDS) {
      expect(reachable).toContain(id)
    }
  })
})
