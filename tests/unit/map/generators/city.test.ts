import { describe, it, expect } from 'vitest'
import { city } from '~~/shared/map/generators/city'
import type { GeneratedMap } from '~~/shared/map/generators/types'

const AREA_COUNT_MIN = 10
const AREA_COUNT_MAX = 15

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function bfsReachable(map: GeneratedMap, start: string): Set<string> {
  const visited = new Set<string>([start])
  const queue: string[] = [start]
  while (queue.length > 0) {
    const node = queue.shift()!
    const neighbours = map.adjacency[node] ?? []
    for (const n of neighbours) {
      if (!visited.has(n)) {
        visited.add(n)
        queue.push(n)
      }
    }
  }
  return visited
}

describe('city generator — determinismo', () => {
  it('produce output bit-identico per stesso (seed, params)', () => {
    const a = city('seed-deterministico', { density: 0.5 })
    const b = city('seed-deterministico', { density: 0.5 })
    expect(deepClone(a)).toEqual(deepClone(b))
  })

  it('produce output diverso per seed diversi', () => {
    const a = city('seed-uno', { density: 0.5 })
    const b = city('seed-due', { density: 0.5 })
    expect(deepClone(a)).not.toEqual(deepClone(b))
  })

  it('produce output diverso al variare di density', () => {
    const a = city('seed-fisso', { density: 0.0 })
    const b = city('seed-fisso', { density: 1.0 })
    expect(a.areas.length).not.toBe(b.areas.length)
  })

  it('default density (params vuoto) è gestito senza errori', () => {
    const a = city('seed-no-density', {})
    expect(a.areas.length).toBeGreaterThanOrEqual(AREA_COUNT_MIN)
    expect(a.areas.length).toBeLessThanOrEqual(AREA_COUNT_MAX)
  })
})

describe('city generator — struttura aree', () => {
  it('areaCount è dentro [10, 15]', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5']) {
      const map = city(seed, { density: 0.5 })
      expect(map.areas.length).toBeGreaterThanOrEqual(AREA_COUNT_MIN)
      expect(map.areas.length).toBeLessThanOrEqual(AREA_COUNT_MAX)
    }
  })

  it('density 0 → areaCountMin, density 1 → areaCountMax', () => {
    const min = city('s', { density: 0 })
    const max = city('s', { density: 1 })
    expect(min.areas.length).toBe(AREA_COUNT_MIN)
    expect(max.areas.length).toBe(AREA_COUNT_MAX)
  })

  it('id area univoci', () => {
    const map = city('seed-id', { density: 0.5 })
    const ids = map.areas.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ogni area ha shape valida dentro al viewBox 1000x700', () => {
    const map = city('seed-shape', { density: 0.7 })
    for (const a of map.areas) {
      expect(a.shape.x).toBeGreaterThanOrEqual(0)
      expect(a.shape.y).toBeGreaterThanOrEqual(0)
      expect(a.shape.x + a.shape.w).toBeLessThanOrEqual(1000)
      expect(a.shape.y + a.shape.h).toBeLessThanOrEqual(700)
      expect(a.shape.w).toBeGreaterThan(0)
      expect(a.shape.h).toBeGreaterThan(0)
    }
  })

  it('ogni area ha detail con layout e props', () => {
    const map = city('seed-detail', { density: 0.5 })
    for (const a of map.areas) {
      expect(['open', 'building', 'corridor', 'crossing']).toContain(a.detail.layout)
      expect(a.detail.width).toBeGreaterThan(0)
      expect(a.detail.height).toBeGreaterThan(0)
      expect(Array.isArray(a.detail.props)).toBe(true)
    }
  })

  it('ogni area ha decor non vuoto con kind tra road/building/tree', () => {
    const map = city('seed-decor', { density: 0.5 })
    const allowed = new Set(['road', 'building', 'tree'])
    for (const a of map.areas) {
      expect(a.decor.length).toBeGreaterThan(0)
      for (const d of a.decor) {
        expect(allowed.has(d.kind)).toBe(true)
      }
    }
  })
})

describe('city generator — spawn / edge', () => {
  it('esattamente 1 area con spawn=true', () => {
    const map = city('seed-spawn', { density: 0.5 })
    const spawns = map.areas.filter(a => a.spawn)
    expect(spawns).toHaveLength(1)
    expect(spawns[0]!.id).toBe(map.spawnAreaId)
  })

  it('lo spawn area è la piazza centrale (nome contiene "Piazza")', () => {
    const map = city('seed-piazza', { density: 0.5 })
    const spawn = map.areas.find(a => a.spawn)!
    expect(spawn.name.toLowerCase()).toContain('piazza')
  })

  it('numero di edge area è tra 2 e 4', () => {
    for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5']) {
      const map = city(seed, { density: 0.5 })
      const edges = map.areas.filter(a => a.edge)
      expect(edges.length).toBeGreaterThanOrEqual(2)
      expect(edges.length).toBeLessThanOrEqual(4)
      expect(edges.map(e => e.id).sort()).toEqual([...map.edgeAreaIds].sort())
    }
  })

  it('lo spawn area NON è marcato edge', () => {
    const map = city('seed-no-edge-spawn', { density: 0.5 })
    const spawn = map.areas.find(a => a.spawn)!
    expect(spawn.edge).toBe(false)
  })
})

describe('city generator — adjacency', () => {
  it('è simmetrica: A in adj[B] ⇔ B in adj[A]', () => {
    const map = city('seed-sym', { density: 0.5 })
    for (const [a, neigh] of Object.entries(map.adjacency)) {
      for (const b of neigh) {
        expect(map.adjacency[b]).toBeDefined()
        expect(map.adjacency[b]).toContain(a)
      }
    }
  })

  it('nessuna area è adiacente a se stessa', () => {
    const map = city('seed-no-self', { density: 0.5 })
    for (const [a, neigh] of Object.entries(map.adjacency)) {
      expect(neigh).not.toContain(a)
    }
  })

  it('tutte le aree sono presenti come chiave in adjacency', () => {
    const map = city('seed-keys', { density: 0.5 })
    for (const a of map.areas) {
      expect(map.adjacency[a.id]).toBeDefined()
    }
  })

  it('mappa connessa: BFS dalla spawn raggiunge tutte le aree', () => {
    for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      const map = city(seed, { density: 0.5 })
      const reachable = bfsReachable(map, map.spawnAreaId)
      expect(reachable.size).toBe(map.areas.length)
    }
  })
})

describe('city generator — background', () => {
  it('è un gradient grigio scuro', () => {
    const map = city('seed-bg', { density: 0.5 })
    expect(map.background.kind).toBe('gradient')
    if (map.background.kind === 'gradient') {
      expect(map.background.from).toMatch(/^#/)
      expect(map.background.to).toMatch(/^#/)
    }
  })
})
