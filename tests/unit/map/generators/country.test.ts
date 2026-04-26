import { describe, it, expect } from 'vitest'
import { country } from '~~/shared/map/generators/country'
import type { GeneratedMap } from '~~/shared/map/generators/types'

const AREA_COUNT_MIN = 6
const AREA_COUNT_MAX = 10
const EDGE_MIN = 3
const EDGE_MAX = 5

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

describe('country generator — determinismo', () => {
  it('produce output bit-identico per stesso (seed, params)', () => {
    const a = country('seed-deterministico', {
      density: 0.5,
      forestRatio: 0.4,
      riverChance: 0.6
    })
    const b = country('seed-deterministico', {
      density: 0.5,
      forestRatio: 0.4,
      riverChance: 0.6
    })
    expect(deepClone(a)).toEqual(deepClone(b))
  })

  it('produce output diverso per seed diversi', () => {
    const a = country('seed-uno', { density: 0.5 })
    const b = country('seed-due', { density: 0.5 })
    expect(deepClone(a)).not.toEqual(deepClone(b))
  })

  it('default params (oggetto vuoto) viene gestito senza errori', () => {
    const a = country('seed-no-params', {})
    expect(a.areas.length).toBeGreaterThanOrEqual(AREA_COUNT_MIN)
    expect(a.areas.length).toBeLessThanOrEqual(AREA_COUNT_MAX)
  })

  it('output diverso al variare di density', () => {
    const a = country('seed-fisso', { density: 0.0 })
    const b = country('seed-fisso', { density: 1.0 })
    expect(a.areas.length).not.toBe(b.areas.length)
  })

  it('stesso seed con forestRatio diverso produce output diversi', () => {
    const a = country('seed-fr', { density: 0.5, forestRatio: 0.0, riverChance: 0.0 })
    const b = country('seed-fr', { density: 0.5, forestRatio: 1.0, riverChance: 0.0 })
    expect(deepClone(a)).not.toEqual(deepClone(b))
  })
})

describe('country generator — struttura aree', () => {
  it('areaCount è dentro [6, 10] su default forestRatio (0.4)', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const map = country(seed, { forestRatio: 0.4 })
      expect(map.areas.length).toBeGreaterThanOrEqual(AREA_COUNT_MIN)
      expect(map.areas.length).toBeLessThanOrEqual(AREA_COUNT_MAX)
    }
  })

  it('density 0 → areaCountMin, density 1 → areaCountMax', () => {
    const min = country('s', { density: 0 })
    const max = country('s', { density: 1 })
    expect(min.areas.length).toBe(AREA_COUNT_MIN)
    expect(max.areas.length).toBe(AREA_COUNT_MAX)
  })

  it('id area univoci', () => {
    const map = country('seed-id', { density: 0.7, forestRatio: 0.8 })
    const ids = map.areas.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('ogni area ha shape valida dentro al viewBox 1000x700', () => {
    const map = country('seed-shape', { density: 0.7 })
    for (const a of map.areas) {
      expect(a.shape.x).toBeGreaterThanOrEqual(0)
      expect(a.shape.y).toBeGreaterThanOrEqual(0)
      expect(a.shape.x + a.shape.w).toBeLessThanOrEqual(1000)
      expect(a.shape.y + a.shape.h).toBeLessThanOrEqual(700)
      expect(a.shape.w).toBeGreaterThan(0)
      expect(a.shape.h).toBeGreaterThan(0)
    }
  })

  it('ogni area ha detail con layout valido e props', () => {
    const map = country('seed-detail', { density: 0.5, riverChance: 0.9 })
    for (const a of map.areas) {
      expect(['open', 'building', 'corridor', 'crossing']).toContain(a.detail.layout)
      expect(a.detail.width).toBeGreaterThan(0)
      expect(a.detail.height).toBeGreaterThan(0)
      expect(Array.isArray(a.detail.props)).toBe(true)
    }
  })

  it('ogni area ha decor non vuoto con kind a tema country', () => {
    const map = country('seed-decor', { density: 0.5 })
    const allowed = new Set(['tree', 'bush', 'fence', 'rock', 'pond', 'path'])
    for (const a of map.areas) {
      expect(a.decor.length).toBeGreaterThan(0)
      for (const d of a.decor) {
        expect(allowed.has(d.kind)).toBe(true)
      }
    }
  })
})

describe('country generator — spawn / edge', () => {
  it('esattamente 1 area con spawn=true', () => {
    const map = country('seed-spawn', { density: 0.5 })
    const spawns = map.areas.filter(a => a.spawn)
    expect(spawns).toHaveLength(1)
    expect(spawns[0]!.id).toBe(map.spawnAreaId)
  })

  it('lo spawn area è Casolare o Fattoria', () => {
    for (const seed of ['sp1', 'sp2', 'sp3', 'sp4', 'sp5']) {
      const map = country(seed, { density: 0.5 })
      const spawn = map.areas.find(a => a.spawn)!
      expect(['Greene Family Farm', 'Hilltop Colony']).toContain(spawn.name)
    }
  })

  it('numero di edge area è tra 3 e 5', () => {
    for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) {
      const map = country(seed, { density: 0.7 })
      const edges = map.areas.filter(a => a.edge)
      expect(edges.length).toBeGreaterThanOrEqual(EDGE_MIN)
      expect(edges.length).toBeLessThanOrEqual(EDGE_MAX)
      expect(edges.map(e => e.id).sort()).toEqual([...map.edgeAreaIds].sort())
    }
  })

  it('lo spawn area NON è marcato edge', () => {
    const map = country('seed-no-edge-spawn', { density: 0.5 })
    const spawn = map.areas.find(a => a.spawn)!
    expect(spawn.edge).toBe(false)
  })
})

describe('country generator — adjacency', () => {
  it('è simmetrica: A in adj[B] ⇔ B in adj[A]', () => {
    const map = country('seed-sym', { density: 0.5 })
    for (const [a, neigh] of Object.entries(map.adjacency)) {
      for (const b of neigh) {
        expect(map.adjacency[b]).toBeDefined()
        expect(map.adjacency[b]).toContain(a)
      }
    }
  })

  it('nessuna area è adiacente a se stessa', () => {
    const map = country('seed-no-self', { density: 0.5 })
    for (const [a, neigh] of Object.entries(map.adjacency)) {
      expect(neigh).not.toContain(a)
    }
  })

  it('tutte le aree sono presenti come chiave in adjacency', () => {
    const map = country('seed-keys', { density: 0.5 })
    for (const a of map.areas) {
      expect(map.adjacency[a.id]).toBeDefined()
    }
  })

  it('mappa connessa: BFS dalla spawn raggiunge tutte le aree', () => {
    for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6']) {
      const map = country(seed, { density: 0.5 })
      const reachable = bfsReachable(map, map.spawnAreaId)
      expect(reachable.size).toBe(map.areas.length)
    }
  })
})

describe('country generator — riverChance', () => {
  it('riverChance > 0.5 forza almeno 1 area Fiume o Ponte', () => {
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const map = country(seed, { density: 0.7, riverChance: 0.9, forestRatio: 0.2 })
      const hasRiverOrBridge = map.areas.some(
        a => a.name === 'Cherokee River' || a.name === 'Stone Creek Bridge'
      )
      expect(hasRiverOrBridge).toBe(true)
    }
  })

  it('riverChance 0 non forza Fiume né Ponte (deterministico)', () => {
    const map = country('seed-no-river', {
      density: 0.5,
      riverChance: 0.0,
      forestRatio: 0.0
    })
    // Con riverChance 0 e forestRatio 0 il pool si riempie solo da
    // BUILDING_NAMES + OPEN_NAMES_POOL, che non contengono né Fiume né Ponte.
    const hasRiver = map.areas.some(a => a.name === 'Cherokee River')
    const hasBridge = map.areas.some(a => a.name === 'Stone Creek Bridge')
    expect(hasRiver).toBe(false)
    expect(hasBridge).toBe(false)
  })
})

describe('country generator — forestRatio', () => {
  it('forestRatio > 0.5 produce ≥ 1 area Bosco', () => {
    for (const seed of ['f1', 'f2', 'f3', 'f4', 'f5']) {
      const map = country(seed, { density: 0.7, forestRatio: 0.8, riverChance: 0.0 })
      const forestCount = map.areas.filter(a => a.name === 'Walker Woods').length
      expect(forestCount).toBeGreaterThanOrEqual(1)
    }
  })

  it('forestRatio alto produce più Bosco di forestRatio basso (in media)', () => {
    let lowTotal = 0
    let highTotal = 0
    const seeds = ['fr1', 'fr2', 'fr3', 'fr4', 'fr5', 'fr6']
    for (const seed of seeds) {
      const low = country(seed, { density: 1.0, forestRatio: 0.1, riverChance: 0.0 })
      const high = country(seed, { density: 1.0, forestRatio: 0.9, riverChance: 0.0 })
      lowTotal += low.areas.filter(a => a.name === 'Walker Woods').length
      highTotal += high.areas.filter(a => a.name === 'Walker Woods').length
    }
    expect(highTotal).toBeGreaterThan(lowTotal)
  })
})

describe('country generator — background', () => {
  it('è un gradient verde/marrone scuro', () => {
    const map = country('seed-bg', { density: 0.5 })
    expect(map.background.kind).toBe('gradient')
    if (map.background.kind === 'gradient') {
      expect(map.background.from).toMatch(/^#/)
      expect(map.background.to).toMatch(/^#/)
    }
  })
})
