import { describe, it, expect } from 'vitest'
import {
  applyAreaOverrides,
  buildEffectiveAdjacency,
  buildEffectiveMap,
  pairKey,
  ADJ_THRESHOLD
} from '~~/shared/map/effective-map'
import type { GeneratedArea, GeneratedMap } from '~~/shared/map/generators/types'

function makeArea(id: string, x: number, y: number, w = 100, h = 100): GeneratedArea {
  return {
    id,
    name: id,
    shape: { kind: 'rect', x, y, w, h },
    edge: false,
    spawn: false,
    decor: [],
    detail: { layout: 'open', width: 800, height: 600, props: [] }
  }
}

describe('applyAreaOverrides', () => {
  it('lascia invariate le aree senza override', () => {
    const base = [makeArea('a', 0, 0), makeArea('b', 200, 0)]
    const out = applyAreaOverrides(base, [])
    expect(out).toHaveLength(2)
    expect(out[0]!.id).toBe('a')
    expect(out[1]!.id).toBe('b')
  })

  it('applica rinomina e sposta da override', () => {
    const base = [makeArea('a', 0, 0)]
    const out = applyAreaOverrides(base, [{
      mapId: 'm1', areaId: 'a',
      customName: 'Alfa',
      x: 50, y: 60, w: null, h: null,
      removed: false, customAdded: false
    }])
    expect(out).toHaveLength(1)
    expect(out[0]!.name).toBe('Alfa')
    expect(out[0]!.shape.x).toBe(50)
    expect(out[0]!.shape.y).toBe(60)
    expect(out[0]!.shape.w).toBe(100) // mantiene base perché w: null
  })

  it('rimuove le aree con removed=true', () => {
    const base = [makeArea('a', 0, 0), makeArea('b', 200, 0)]
    const out = applyAreaOverrides(base, [{
      mapId: 'm1', areaId: 'a',
      customName: null, x: null, y: null, w: null, h: null,
      removed: true, customAdded: false
    }])
    expect(out).toHaveLength(1)
    expect(out[0]!.id).toBe('b')
  })

  it('aggiunge le aree custom-added', () => {
    const base = [makeArea('a', 0, 0)]
    const out = applyAreaOverrides(base, [{
      mapId: 'm1', areaId: 'custom_xyz',
      customName: 'Bunker',
      x: 400, y: 400, w: 80, h: 60,
      removed: false, customAdded: true
    }])
    expect(out).toHaveLength(2)
    expect(out[1]!.id).toBe('custom_xyz')
    expect(out[1]!.name).toBe('Bunker')
    expect(out[1]!.shape.x).toBe(400)
    expect(out[1]!.shape.w).toBe(80)
  })

  it('un override con removed+customAdded NON aggiunge la riga', () => {
    const base: GeneratedArea[] = []
    const out = applyAreaOverrides(base, [{
      mapId: 'm1', areaId: 'custom_x',
      customName: 'X', x: 0, y: 0, w: 50, h: 50,
      removed: true, customAdded: true
    }])
    expect(out).toHaveLength(0)
  })
})

describe('buildEffectiveAdjacency', () => {
  it('crea adjacency by-proximity sotto la soglia', () => {
    // distanza < 280: a(50,50) ↔ b(150,50) centroidi distanza 100
    const areas = [makeArea('a', 0, 0), makeArea('b', 100, 0)]
    const { visibleAdj, brokenPairs } = buildEffectiveAdjacency(areas, [])
    expect(visibleAdj.a).toContain('b')
    expect(visibleAdj.b).toContain('a')
    expect(brokenPairs.size).toBe(0)
  })

  it('NON crea adjacency tra aree oltre la soglia', () => {
    // centroidi a(50,50) e b(450,50): distanza 400 > 280
    const areas = [makeArea('a', 0, 0), makeArea('b', 400, 0)]
    const { visibleAdj } = buildEffectiveAdjacency(areas, [])
    expect(visibleAdj.a).not.toContain('b')
  })

  it("'add' forza una coppia anche se distante", () => {
    const areas = [makeArea('a', 0, 0), makeArea('b', 600, 0)]
    const { visibleAdj } = buildEffectiveAdjacency(areas, [{
      mapId: 'm1', areaA: 'a', areaB: 'b', kind: 'add', roadKind: null
    }])
    expect(visibleAdj.a).toContain('b')
    expect(visibleAdj.b).toContain('a')
  })

  it("'remove' sopprime una coppia by-proximity", () => {
    const areas = [makeArea('a', 0, 0), makeArea('b', 100, 0)]
    const { visibleAdj } = buildEffectiveAdjacency(areas, [{
      mapId: 'm1', areaA: 'a', areaB: 'b', kind: 'remove', roadKind: null
    }])
    expect(visibleAdj.a).not.toContain('b')
    expect(visibleAdj.b).not.toContain('a')
  })

  it("'broken' lascia la coppia visibile ma la marca in brokenPairs", () => {
    const areas = [makeArea('a', 0, 0), makeArea('b', 100, 0)]
    const { visibleAdj, brokenPairs } = buildEffectiveAdjacency(areas, [{
      mapId: 'm1', areaA: 'a', areaB: 'b', kind: 'broken', roadKind: null
    }])
    expect(visibleAdj.a).toContain('b')
    expect(brokenPairs.has(pairKey('a', 'b'))).toBe(true)
  })

  it('ignora override con areaId non in lista', () => {
    const areas = [makeArea('a', 0, 0), makeArea('b', 100, 0)]
    const { visibleAdj } = buildEffectiveAdjacency(areas, [{
      mapId: 'm1', areaA: 'a', areaB: 'fantasma', kind: 'add', roadKind: null
    }])
    expect(visibleAdj.a).toContain('b')
    expect(visibleAdj.a).not.toContain('fantasma')
  })

  it('soglia esposta come ADJ_THRESHOLD', () => {
    expect(ADJ_THRESHOLD).toBe(280)
  })
})

describe('pairKey', () => {
  it('è simmetrico (ordine lessicografico)', () => {
    expect(pairKey('b', 'a')).toBe('a::b')
    expect(pairKey('a', 'b')).toBe('a::b')
  })
})

describe('buildEffectiveMap', () => {
  function makeBase(): GeneratedMap {
    return {
      areas: [makeArea('a', 0, 0), makeArea('b', 200, 0)],
      adjacency: { a: ['b'], b: ['a'] },
      spawnAreaId: 'a',
      edgeAreaIds: [],
      background: { kind: 'gradient', from: '#000', to: '#111' }
    }
  }

  it('combina area overrides e adjacency overrides', () => {
    const base = makeBase()
    const out = buildEffectiveMap(
      base,
      [{
        mapId: 'm1', areaId: 'a',
        customName: 'Alfa', x: 100, y: 0, w: null, h: null,
        removed: false, customAdded: false
      }],
      [{ mapId: 'm1', areaA: 'a', areaB: 'b', kind: 'remove', roadKind: null }]
    )
    expect(out.areas[0]!.name).toBe('Alfa')
    expect(out.adjacency.a ?? []).not.toContain('b')
  })

  it('preserva spawnAreaId solo se ancora presente, altrimenti fallback', () => {
    const base = makeBase()
    const out = buildEffectiveMap(
      base,
      [{
        mapId: 'm1', areaId: 'a',
        customName: null, x: null, y: null, w: null, h: null,
        removed: true, customAdded: false
      }],
      []
    )
    expect(out.areas).toHaveLength(1)
    expect(out.areas[0]!.id).toBe('b')
    expect(out.spawnAreaId).toBe('b')
  })
})
