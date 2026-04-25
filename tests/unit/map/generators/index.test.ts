import { beforeEach, describe, expect, it } from 'vitest'
import { DomainError } from '~~/shared/errors'
import {
  GENERATORS,
  _resetGeneratorCache,
  generate
} from '~~/shared/map/generators'

describe('generator registry + cache', () => {
  beforeEach(() => {
    _resetGeneratorCache()
  })

  it('espone i generatori city, country, wasteland nel registry', () => {
    expect(GENERATORS).toHaveProperty('city')
    expect(GENERATORS).toHaveProperty('country')
    expect(GENERATORS).toHaveProperty('wasteland')
    expect(typeof GENERATORS.city).toBe('function')
    expect(typeof GENERATORS.country).toBe('function')
    expect(typeof GENERATORS.wasteland).toBe('function')
  })

  it('genera una GeneratedMap valida con almeno un\'area', () => {
    const map = generate('city', 'seed1', { density: 0.5 })
    expect(map).toBeDefined()
    expect(Array.isArray(map.areas)).toBe(true)
    expect(map.areas.length).toBeGreaterThan(0)
    expect(map.spawnAreaId).toBeTypeOf('string')
    expect(Array.isArray(map.edgeAreaIds)).toBe(true)
  })

  it('cache hit: due chiamate con stessi argomenti ritornano lo stesso oggetto', () => {
    const a = generate('city', 'seed1', { density: 0.5 })
    const b = generate('city', 'seed1', { density: 0.5 })
    expect(b).toBe(a)
  })

  it('cache key indipendente dall\'ordine delle chiavi dei params', () => {
    const a = generate('city', 'seed-key', { a: 1, b: 2 })
    const b = generate('city', 'seed-key', { b: 2, a: 1 })
    expect(b).toBe(a)
  })

  it('dopo _resetGeneratorCache una nuova chiamata produce un oggetto non identico', () => {
    const a = generate('city', 'seed-reset', { density: 0.3 })
    _resetGeneratorCache()
    const b = generate('city', 'seed-reset', { density: 0.3 })
    expect(b).not.toBe(a)
    expect(b).toEqual(a)
  })

  it('unknown type throws DomainError map_type_not_found', () => {
    expect(() => generate('unknown', 's', {})).toThrow(DomainError)
    try {
      generate('unknown', 's', {})
    } catch (e) {
      expect(e).toBeInstanceOf(DomainError)
      expect((e as DomainError).code).toBe('map_type_not_found')
    }
  })

  it('genera mappe diverse per type diversi a parità di seed', () => {
    const c = generate('country', 'sx', {})
    const w = generate('wasteland', 'sx', {})
    expect(c).not.toEqual(w)
  })
})
