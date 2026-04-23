import { describe, it, expect } from 'vitest'
import { deriveCityState, type AreaStatus } from '~~/shared/seed/derive-city'
import { AREA_IDS } from '~~/shared/map/areas'

describe('deriveCityState', () => {
  it('è deterministico', () => {
    const a = deriveCityState('550e8400-e29b-41d4-a716-446655440000')
    const b = deriveCityState('550e8400-e29b-41d4-a716-446655440000')
    expect(a).toEqual(b)
  })

  it('cityName non vuoto', () => {
    const s = deriveCityState('abc-123')
    expect(s.cityName.length).toBeGreaterThan(0)
  })

  it('copre tutte le aree', () => {
    const s = deriveCityState('seed-x')
    for (const id of AREA_IDS) {
      expect(s.areas[id]).toBeDefined()
      expect(['intact', 'infested', 'ruined', 'closed']).toContain(s.areas[id].status)
    }
  })

  it('piazza è sempre intact', () => {
    for (let i = 0; i < 20; i++) {
      const s = deriveCityState(`seed-${i}`)
      expect(s.areas.piazza.status).toBe<AreaStatus>('intact')
    }
  })

  it('su 1000 seed la distribuzione degli status rispetta circa 40/35/20/5', () => {
    const counts: Record<string, number> = { intact: 0, infested: 0, ruined: 0, closed: 0 }
    let total = 0
    for (let i = 0; i < 1000; i++) {
      const s = deriveCityState(`seed-${i}`)
      for (const id of AREA_IDS) {
        if (id === 'piazza') continue
        counts[s.areas[id].status]++
        total++
      }
    }
    expect(counts.intact / total).toBeGreaterThan(0.33)
    expect(counts.intact / total).toBeLessThan(0.47)
    expect(counts.infested / total).toBeGreaterThan(0.28)
    expect(counts.infested / total).toBeLessThan(0.42)
    expect(counts.ruined / total).toBeGreaterThan(0.14)
    expect(counts.ruined / total).toBeLessThan(0.26)
    expect(counts.closed / total).toBeGreaterThan(0.02)
    expect(counts.closed / total).toBeLessThan(0.08)
  })
})
