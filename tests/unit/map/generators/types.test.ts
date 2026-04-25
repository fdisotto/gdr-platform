import { describe, it, expect } from 'vitest'
import { cacheKey } from '~~/shared/map/generators/types'
import type {
  GenParams,
  GeneratedArea,
  GeneratedAreaDetail,
  GeneratedBackground,
  GeneratedDecor,
  GeneratedMap,
  GeneratorFn
} from '~~/shared/map/generators/types'

describe('cacheKey', () => {
  it('è invariante rispetto all\'ordine delle chiavi dei params', () => {
    const a = cacheKey('city', 'seed-1', { density: 0.4, ruinRatio: 0.2 })
    const b = cacheKey('city', 'seed-1', { ruinRatio: 0.2, density: 0.4 })
    expect(a).toBe(b)
  })

  it('cambia al variare del type', () => {
    const a = cacheKey('city', 'seed-1', { density: 0.4 })
    const b = cacheKey('country', 'seed-1', { density: 0.4 })
    expect(a).not.toBe(b)
  })

  it('cambia al variare del seed', () => {
    const a = cacheKey('city', 'seed-1', { density: 0.4 })
    const b = cacheKey('city', 'seed-2', { density: 0.4 })
    expect(a).not.toBe(b)
  })

  it('cambia al variare dei params', () => {
    const a = cacheKey('city', 'seed-1', { density: 0.4 })
    const b = cacheKey('city', 'seed-1', { density: 0.5 })
    expect(a).not.toBe(b)
  })

  it('gestisce params vuoti in modo deterministico', () => {
    const a = cacheKey('wasteland', 'seed-1', {})
    const b = cacheKey('wasteland', 'seed-1', {})
    expect(a).toBe(b)
    expect(a).toContain('wasteland')
    expect(a).toContain('seed-1')
  })
})

describe('contratti tipi generator', () => {
  it('un GeneratedMap minimale soddisfa il contratto a compile-time', () => {
    const decor: GeneratedDecor = { kind: 'tree', x: 10, y: 20 }
    const detail: GeneratedAreaDetail = {
      layout: 'open',
      width: 800,
      height: 600,
      props: [decor]
    }
    const area: GeneratedArea = {
      id: 'a-1',
      name: 'Piazza Centrale',
      shape: { x: 0, y: 0, w: 100, h: 100, kind: 'rect' },
      edge: false,
      spawn: true,
      decor: [decor],
      detail
    }
    const background: GeneratedBackground = { kind: 'gradient', from: '#000', to: '#111' }
    const map: GeneratedMap = {
      areas: [area],
      adjacency: { 'a-1': [] },
      spawnAreaId: 'a-1',
      edgeAreaIds: [],
      background
    }

    expect(map.areas).toHaveLength(1)
    expect(map.spawnAreaId).toBe('a-1')
    expect(map.background.kind).toBe('gradient')
  })

  it('GeneratorFn accetta seed e params e ritorna GeneratedMap', () => {
    const fn: GeneratorFn = (_seed, _params) => ({
      areas: [],
      adjacency: {},
      spawnAreaId: '',
      edgeAreaIds: [],
      background: { kind: 'noise', baseColor: '#222', density: 0.3 }
    })
    const params: GenParams = { density: 0.5 }
    const result = fn('seed', params)
    expect(result.background.kind).toBe('noise')
  })
})
