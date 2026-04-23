import { describe, it, expect } from 'vitest'
import { computeWeather, WEATHER_CODES } from '~~/shared/map/weather'

const SEED = 'test-seed-uuid'

// 2026-04-15 12:00 UTC, giorno
const DAY = new Date('2026-04-15T12:00:00Z').getTime()
// 2026-04-15 23:00 UTC, notte
const NIGHT = new Date('2026-04-15T23:00:00Z').getTime()

describe('computeWeather', () => {
  it('è deterministica (stesso seed+area+tempo → stesso risultato)', () => {
    const a = computeWeather(SEED, 'piazza', DAY)
    const b = computeWeather(SEED, 'piazza', DAY)
    expect(a).toEqual(b)
  })

  it('produce code valido e intensity in [0,1]', () => {
    for (const areaId of ['piazza', 'fogne', 'radio', 'porto'] as const) {
      const w = computeWeather(SEED, areaId, DAY)
      expect(WEATHER_CODES).toContain(w.code)
      expect(w.intensity).toBeGreaterThanOrEqual(0)
      expect(w.intensity).toBeLessThanOrEqual(1)
      expect(w.label.length).toBeGreaterThan(0)
    }
  })

  it('di notte tende a night/fog più che di giorno', () => {
    let nightOrFogNight = 0
    let nightOrFogDay = 0
    for (let i = 0; i < 200; i++) {
      const seed = `s-${i}`
      if (['night', 'fog'].includes(computeWeather(seed, 'piazza', NIGHT).code)) nightOrFogNight++
      if (['night', 'fog'].includes(computeWeather(seed, 'piazza', DAY).code)) nightOrFogDay++
    }
    expect(nightOrFogNight).toBeGreaterThan(nightOrFogDay)
  })

  it('aree diverse producono risultati diversi (almeno in media)', () => {
    let diffs = 0
    for (let i = 0; i < 50; i++) {
      const a = computeWeather(`s-${i}`, 'fogne', DAY)
      const b = computeWeather(`s-${i}`, 'radio', DAY)
      if (a.code !== b.code) diffs++
    }
    expect(diffs).toBeGreaterThan(5)
  })
})
