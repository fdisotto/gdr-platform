import { describe, it, expect } from 'vitest'
import { wasteland } from '~~/shared/map/generators/wasteland'
import type { GeneratedMap } from '~~/shared/map/generators/types'

const AREA_COUNT_MIN = 6
const AREA_COUNT_MAX = 12
const EDGE_MIN = 4
const EDGE_MAX = 6

const ALLOWED_DECOR = new Set([
  'crater',
  'ruin',
  'bone',
  'wreck',
  'barricade',
  'radiation'
])

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

describe('wasteland generator — determinismo', () => {
  it('produce output bit-identico per stesso (seed, params)', () => {
    const a = wasteland('seed-deterministico', {
      density: 0.5,
      ruinRatio: 0.5,
      craterCount: 2
    })
    const b = wasteland('seed-deterministico', {
      density: 0.5,
      ruinRatio: 0.5,
      craterCount: 2
    })
    expect(deepClone(a)).toEqual(deepClone(b))
  })

  it('produce output bit-identico anche con seed diversi (multi-seed sweep)', () => {
    for (const seed of ['ws1', 'ws2', 'ws3', 'ws-lungo-asimmetrico-42']) {
      const a = wasteland(seed, { density: 0.7, ruinRatio: 0.6, craterCount: 3 })
      const b = wasteland(seed, { density: 0.7, ruinRatio: 0.6, craterCount: 3 })
      expect(deepClone(a)).toEqual(deepClone(b))
    }
  })

  it('produce output diverso per seed diversi', () => {
    const a = wasteland('seed-uno', { density: 0.5 })
    const b = wasteland('seed-due', { density: 0.5 })
    expect(deepClone(a)).not.toEqual(deepClone(b))
  })

  it('default params (oggetto vuoto) viene gestito senza errori', () => {
    const a = wasteland('seed-no-params', {})
    expect(a.areas.length).toBeGreaterThanOrEqual(AREA_COUNT_MIN)
    expect(a.areas.length).toBeLessThanOrEqual(AREA_COUNT_MAX)
  })

  it('output diverso al variare di density', () => {
    const a = wasteland('seed-fisso', { density: 0.0 })
    const b = wasteland('seed-fisso', { density: 1.0 })
    expect(a.areas.length).not.toBe(b.areas.length)
  })

  it('stesso seed con ruinRatio diverso produce output diversi', () => {
    const a = wasteland('seed-rr', { density: 0.7, ruinRatio: 0.0, craterCount: 0 })
    const b = wasteland('seed-rr', { density: 0.7, ruinRatio: 1.0, craterCount: 0 })
    expect(deepClone(a)).not.toEqual(deepClone(b))
  })

  it('stesso seed con craterCount diverso produce output diversi', () => {
    const a = wasteland('seed-cc', { density: 0.7, ruinRatio: 0.0, craterCount: 0 })
    const b = wasteland('seed-cc', { density: 0.7, ruinRatio: 0.0, craterCount: 4 })
    expect(deepClone(a)).not.toEqual(deepClone(b))
  })
})

describe('wasteland generator — struttura aree', () => {
  it('areaCount è dentro [6, 12] su default params', () => {
    for (const seed of ['s1', 's2', 's3', 's4', 's5', 's6']) {
      const map = wasteland(seed, {})
      expect(map.areas.length).toBeGreaterThanOrEqual(AREA_COUNT_MIN)
      expect(map.areas.length).toBeLessThanOrEqual(AREA_COUNT_MAX)
    }
  })

  it('density 0 → areaCountMin, density 1 → areaCountMax', () => {
    const min = wasteland('s', { density: 0 })
    const max = wasteland('s', { density: 1 })
    expect(min.areas.length).toBe(AREA_COUNT_MIN)
    expect(max.areas.length).toBe(AREA_COUNT_MAX)
  })

  it('id area univoci', () => {
    const map = wasteland('seed-id', { density: 1.0, ruinRatio: 0.9, craterCount: 5 })
    const ids = map.areas.map(a => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('id deriva da slugify(name) (non literal hard-coded)', () => {
    // Spawn "Accampamento" o "Avamposto": slug deve essere uguale al
    // toLowerCase del name (privo di accenti, qui assenti).
    const map = wasteland('seed-slug', { density: 0.5 })
    const spawn = map.areas.find(a => a.spawn)!
    expect(spawn.id).toBe(spawn.name.toLowerCase())

    // Per le aree non-spawn la chiave include `_${i}`. Verifica che il
    // prefisso sia lo slug del name.
    for (let i = 1; i < map.areas.length; i++) {
      const a = map.areas[i]!
      const slug = a.name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
      expect(a.id.startsWith(slug)).toBe(true)
    }
  })

  it('ogni area ha shape valida dentro al viewBox 1000x700', () => {
    const map = wasteland('seed-shape', { density: 0.7 })
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
    const map = wasteland('seed-detail', { density: 0.7, craterCount: 3 })
    for (const a of map.areas) {
      expect(['open', 'building', 'corridor', 'crossing']).toContain(a.detail.layout)
      expect(a.detail.width).toBeGreaterThan(0)
      expect(a.detail.height).toBeGreaterThan(0)
      expect(Array.isArray(a.detail.props)).toBe(true)
    }
  })

  it('Bunker / Avamposto / Posto di Blocco hanno layout building', () => {
    // Forza density alta + ruinRatio basso + craterCount basso → pool si
    // riempie di building/open/crossing con maggior probabilità di toccarli.
    const map = wasteland('seed-bld', { density: 1.0, ruinRatio: 0.0, craterCount: 0 })
    const buildingNames = new Set(['Bunker', 'Avamposto', 'Posto di Blocco'])
    for (const a of map.areas) {
      if (a.spawn) continue // Avamposto come spawn è 'open' per design
      if (buildingNames.has(a.name)) {
        expect(a.detail.layout).toBe('building')
      }
    }
  })

  it('Ponte Sgretolato ha layout crossing (quando presente)', () => {
    // Testa su più seed in modo che almeno una mappa contenga il ponte.
    let foundAtLeastOne = false
    for (const seed of ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8']) {
      const map = wasteland(seed, { density: 1.0, ruinRatio: 0.0, craterCount: 0 })
      for (const a of map.areas) {
        if (a.name === 'Ponte Sgretolato') {
          expect(a.detail.layout).toBe('crossing')
          foundAtLeastOne = true
        }
      }
    }
    expect(foundAtLeastOne).toBe(true)
  })

  it('ogni area ha decor non vuoto con kind a tema wasteland', () => {
    const map = wasteland('seed-decor', { density: 0.7, craterCount: 2 })
    for (const a of map.areas) {
      expect(a.decor.length).toBeGreaterThan(0)
      for (const d of a.decor) {
        expect(ALLOWED_DECOR.has(d.kind)).toBe(true)
      }
    }
  })
})

describe('wasteland generator — spawn / edge', () => {
  it('esattamente 1 area con spawn=true', () => {
    const map = wasteland('seed-spawn', { density: 0.7 })
    const spawns = map.areas.filter(a => a.spawn)
    expect(spawns).toHaveLength(1)
    expect(spawns[0]!.id).toBe(map.spawnAreaId)
  })

  it('lo spawn area è Accampamento o Avamposto', () => {
    for (const seed of ['sp1', 'sp2', 'sp3', 'sp4', 'sp5', 'sp6']) {
      const map = wasteland(seed, { density: 0.5 })
      const spawn = map.areas.find(a => a.spawn)!
      expect(['Accampamento', 'Avamposto']).toContain(spawn.name)
      expect(spawn.detail.layout).toBe('open')
    }
  })

  it('numero di edge area è tra 4 e 6', () => {
    for (const seed of ['e1', 'e2', 'e3', 'e4', 'e5', 'e6']) {
      const map = wasteland(seed, { density: 1.0 })
      const edges = map.areas.filter(a => a.edge)
      expect(edges.length).toBeGreaterThanOrEqual(EDGE_MIN)
      expect(edges.length).toBeLessThanOrEqual(EDGE_MAX)
      expect(edges.map(e => e.id).sort()).toEqual([...map.edgeAreaIds].sort())
    }
  })

  it('lo spawn area NON è marcato edge', () => {
    const map = wasteland('seed-no-edge-spawn', { density: 0.5 })
    const spawn = map.areas.find(a => a.spawn)!
    expect(spawn.edge).toBe(false)
  })
})

describe('wasteland generator — adjacency', () => {
  it('è simmetrica: A in adj[B] ⇔ B in adj[A]', () => {
    const map = wasteland('seed-sym', { density: 0.7 })
    for (const [a, neigh] of Object.entries(map.adjacency)) {
      for (const b of neigh) {
        expect(map.adjacency[b]).toBeDefined()
        expect(map.adjacency[b]).toContain(a)
      }
    }
  })

  it('nessuna area è adiacente a se stessa', () => {
    const map = wasteland('seed-no-self', { density: 0.7 })
    for (const [a, neigh] of Object.entries(map.adjacency)) {
      expect(neigh).not.toContain(a)
    }
  })

  it('tutte le aree sono presenti come chiave in adjacency', () => {
    const map = wasteland('seed-keys', { density: 0.5 })
    for (const a of map.areas) {
      expect(map.adjacency[a.id]).toBeDefined()
    }
  })

  it('mappa connessa: BFS dalla spawn raggiunge tutte le aree', () => {
    for (const seed of ['c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8']) {
      const map = wasteland(seed, { density: 0.7 })
      const reachable = bfsReachable(map, map.spawnAreaId)
      expect(reachable.size).toBe(map.areas.length)
    }
  })
})

describe('wasteland generator — ruinRatio', () => {
  it('ruinRatio > 0.5 produce ≥ 1 area Rovine (multi-seed)', () => {
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const map = wasteland(seed, {
        density: 0.7,
        ruinRatio: 0.8,
        craterCount: 1
      })
      const ruinCount = map.areas.filter(a => a.name === 'Rovine').length
      expect(ruinCount).toBeGreaterThanOrEqual(1)
    }
  })

  it('ruinRatio 0 non forza Rovine se nemmeno il pool casuale le include', () => {
    // Le Rovine vengono inserite SOLO via quota ruinRatio nel buildNamePool;
    // non sono nel pool theme generico. Con ruinRatio 0 e craterCount 0
    // nessuna area dovrebbe chiamarsi Rovine.
    const map = wasteland('seed-no-ruin', {
      density: 0.7,
      ruinRatio: 0.0,
      craterCount: 0
    })
    const ruinCount = map.areas.filter(a => a.name === 'Rovine').length
    expect(ruinCount).toBe(0)
  })

  it('ruinRatio alto produce più Rovine di ruinRatio basso (in media)', () => {
    let lowTotal = 0
    let highTotal = 0
    const seeds = ['rr1', 'rr2', 'rr3', 'rr4', 'rr5', 'rr6']
    for (const seed of seeds) {
      const low = wasteland(seed, {
        density: 1.0,
        ruinRatio: 0.1,
        craterCount: 0
      })
      const high = wasteland(seed, {
        density: 1.0,
        ruinRatio: 0.9,
        craterCount: 0
      })
      lowTotal += low.areas.filter(a => a.name === 'Rovine').length
      highTotal += high.areas.filter(a => a.name === 'Rovine').length
    }
    expect(highTotal).toBeGreaterThan(lowTotal)
  })
})

describe('wasteland generator — craterCount', () => {
  it('craterCount > 0 produce ≥ 1 area con nome che inizia per "Cratere"', () => {
    for (const seed of ['k1', 'k2', 'k3', 'k4', 'k5']) {
      const map = wasteland(seed, {
        density: 0.7,
        ruinRatio: 0.2,
        craterCount: 2
      })
      const craterCount = map.areas.filter(a => a.name.startsWith('Cratere')).length
      // Spec semplificata: almeno 1 cratere se craterCount > 0 e areaCount > 1.
      expect(map.areas.length).toBeGreaterThan(1)
      expect(craterCount).toBeGreaterThanOrEqual(1)
    }
  })

  it('craterCount 0 non produce alcun cratere', () => {
    const map = wasteland('seed-zero-craters', {
      density: 0.7,
      ruinRatio: 0.5,
      craterCount: 0
    })
    const craterCount = map.areas.filter(a => a.name.startsWith('Cratere')).length
    expect(craterCount).toBe(0)
  })

  it('craterCount allocato fino a min(craterCount, areaCount-1)', () => {
    // density 0 → areaCount = 6, quindi craterCount viene capato a 5.
    const map = wasteland('seed-cap', {
      density: 0.0,
      ruinRatio: 0.0,
      craterCount: 99
    })
    const craterCount = map.areas.filter(a => a.name.startsWith('Cratere')).length
    expect(map.areas.length).toBe(AREA_COUNT_MIN)
    // Almeno areaCount-1 (5) crateri perché craterCount richiesto > slot.
    expect(craterCount).toBeGreaterThanOrEqual(map.areas.length - 1)
    expect(craterCount).toBeLessThanOrEqual(map.areas.length - 1)
  })

  it('crateri usano la kind decor "crater"', () => {
    const map = wasteland('seed-crater-decor', {
      density: 0.7,
      ruinRatio: 0.0,
      craterCount: 4
    })
    const craters = map.areas.filter(a => a.name.startsWith('Cratere'))
    expect(craters.length).toBeGreaterThan(0)
    // Il pool decor dei crateri include sempre 'crater'; il PRNG può
    // pescare anche bone/wreck/radiation, quindi verifichiamo solo che
    // tra TUTTE le aree cratere almeno una abbia almeno un decor 'crater'.
    const hasCraterDecor = craters.some(c =>
      c.decor.some(d => d.kind === 'crater')
      || c.detail.props.some(d => d.kind === 'crater')
    )
    expect(hasCraterDecor).toBe(true)
  })
})

describe('wasteland generator — background', () => {
  it('è un gradient marrone/grigio post-apocalittico', () => {
    const map = wasteland('seed-bg', { density: 0.5 })
    expect(map.background.kind).toBe('gradient')
    if (map.background.kind === 'gradient') {
      expect(map.background.from).toBe('#2c1d12')
      expect(map.background.to).toBe('#3a2f25')
    }
  })
})
