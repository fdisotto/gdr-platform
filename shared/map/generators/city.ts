/**
 * Generator deterministico per mappe di tipo "city".
 *
 * Dato (seed, params) produce una `GeneratedMap` riproducibile bit-per-bit.
 * Layout: viewBox 1000x700, piazza centrale come spawn, edifici tematici
 * disposti su griglia perturbata, adiacenze a corto raggio + edge marcate
 * sui bordi. Output usato sia dal renderer SVG che da quello Pixi (T19+).
 */

import { mulberry32, seedFromString } from '../../seed/prng'
import type {
  GenParams,
  GeneratedArea,
  GeneratedAreaDetail,
  GeneratedAreaShape,
  GeneratedDecor,
  GeneratedMap,
  GeneratorFn
} from './types'
import { organicizeShape } from './shape-utils'

const VIEWBOX_W = 1000
const VIEWBOX_H = 700

const AREA_COUNT_MIN = 10
const AREA_COUNT_MAX = 15

// Dimensioni shape area sul viewBox principale.
const AREA_W = 130
const AREA_H = 90
const AREA_PADDING = 12

// Soglia distanza centri per considerare due aree adiacenti.
const ADJACENCY_THRESHOLD = 250

// ViewBox del detail (interno area).
const DETAIL_W = 800
const DETAIL_H = 600

// Centro piazza (spawn) sul viewBox principale.
const PIAZZA_W = 150
const PIAZZA_H = 110
const PIAZZA_X = Math.round((VIEWBOX_W - PIAZZA_W) / 2)
const PIAZZA_Y = Math.round((VIEWBOX_H - PIAZZA_H) / 2)

// Pool nomi edifici tematici, urbano US "The Walking Dead" style
// (escluso "Town Square", riservato allo spawn).
const BUILDING_NAMES = [
  'First Baptist Church',
  'Memorial Hospital',
  'Walmart Supercenter',
  'Sheriff\'s Department',
  'Lincoln High School',
  'Old Bridge',
  'City Sewers',
  'Riverside Docks',
  'Radio Tower KXR-7',
  'Chevron Gas Station',
  'Civil Defense Shelter',
  'Fire Station No. 4',
  'Farmer\'s Market',
  'Wells Fargo Bank',
  'Royal Cinema',
  'Greyhound Station',
  'Public Library',
  'Grand Theater',
  'Diner & Grill',
  'Motel 6'
] as const

// Nomi extra mescolati ai building (layout "open"): zone urbane aperte.
const OPEN_NAME_POOL = [
  'Suburban Quarter',
  'Memorial Park',
  'Riverwalk',
  'Pine Street',
  'City Cemetery'
] as const

// Nomi che producono un layout "open" anziché "building" (zone aperte).
const OPEN_NAMES = new Set<string>([...OPEN_NAME_POOL, 'Old Bridge', 'Riverside Docks'])

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value))
}

function pick<T>(rng: () => number, arr: readonly T[]): T {
  const idx = Math.floor(rng() * arr.length)
  return arr[Math.min(idx, arr.length - 1)]!
}

function shuffle<T>(rng: () => number, arr: readonly T[]): T[] {
  const out = arr.slice()
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function rectsOverlap(
  a: { x: number, y: number, w: number, h: number },
  b: { x: number, y: number, w: number, h: number }
): boolean {
  return !(
    a.x + a.w + AREA_PADDING <= b.x
    || b.x + b.w + AREA_PADDING <= a.x
    || a.y + a.h + AREA_PADDING <= b.y
    || b.y + b.h + AREA_PADDING <= a.y
  )
}

function shapeCenter(shape: GeneratedAreaShape): { x: number, y: number } {
  return { x: shape.x + shape.w / 2, y: shape.y + shape.h / 2 }
}

function distance(
  a: { x: number, y: number },
  b: { x: number, y: number }
): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.sqrt(dx * dx + dy * dy)
}

function generateDecor(
  rng: () => number,
  layout: GeneratedAreaDetail['layout']
): GeneratedDecor[] {
  const count = 1 + Math.floor(rng() * 3) // 1..3
  const out: GeneratedDecor[] = []
  // Pool di kind dipende dal layout: open privilegia tree/road,
  // building privilegia building/road.
  const pool: Array<'road' | 'building' | 'tree'>
    = layout === 'open'
      ? ['tree', 'road', 'tree', 'building']
      : ['building', 'road', 'building', 'tree']
  for (let i = 0; i < count; i++) {
    const kind = pick(rng, pool)
    const x = Math.floor(rng() * (DETAIL_W - 100)) + 20
    const y = Math.floor(rng() * (DETAIL_H - 100)) + 20
    const w = 40 + Math.floor(rng() * 80)
    const h = 30 + Math.floor(rng() * 60)
    out.push({ kind, x, y, w, h })
  }
  return out
}

function buildArea(
  id: string,
  name: string,
  shape: GeneratedAreaShape,
  rng: () => number,
  spawn: boolean
): GeneratedArea {
  const layout: GeneratedAreaDetail['layout']
    = spawn || OPEN_NAMES.has(name) ? 'open' : 'building'
  const detailProps = generateDecor(rng, layout)
  const decor = generateDecor(rng, layout)
  return {
    id,
    name,
    shape,
    edge: false,
    spawn,
    decor,
    detail: {
      layout,
      width: DETAIL_W,
      height: DETAIL_H,
      props: detailProps
    }
  }
}

function isEdgeShape(shape: GeneratedAreaShape): boolean {
  const cx = shape.x + shape.w / 2
  const cy = shape.y + shape.h / 2
  return cx < 200 || cx > 800 || cy < 140 || cy > 560
}

/**
 * Posiziona le aree su una griglia perturbata. Riserva il centro alla piazza,
 * poi tenta `attempts` posizioni casuali per ogni building evitando overlap
 * con quanto già piazzato.
 */
function placeAreas(
  rng: () => number,
  count: number,
  _names: string[]
): GeneratedAreaShape[] {
  const placed: GeneratedAreaShape[] = []
  // Piazza centrale.
  placed.push({ x: PIAZZA_X, y: PIAZZA_Y, w: PIAZZA_W, h: PIAZZA_H, kind: 'rect' })

  const cellsX = 4
  const cellsY = 3
  const cellW = VIEWBOX_W / cellsX
  const cellH = VIEWBOX_H / cellsY

  for (let i = 1; i < count; i++) {
    let placedThis: GeneratedAreaShape | null = null
    // Prova fino a 80 volte cell+jitter per piazzare senza overlap.
    for (let attempt = 0; attempt < 80; attempt++) {
      const cellIdx = Math.floor(rng() * (cellsX * cellsY))
      const cx = cellIdx % cellsX
      const cy = Math.floor(cellIdx / cellsX)
      const baseX = cx * cellW
      const baseY = cy * cellH
      const jitterX = rng() * Math.max(0, cellW - AREA_W - AREA_PADDING)
      const jitterY = rng() * Math.max(0, cellH - AREA_H - AREA_PADDING)
      const x = clamp(Math.round(baseX + jitterX), 5, VIEWBOX_W - AREA_W - 5)
      const y = clamp(Math.round(baseY + jitterY), 5, VIEWBOX_H - AREA_H - 5)
      const candidate: GeneratedAreaShape = {
        x,
        y,
        w: AREA_W,
        h: AREA_H,
        kind: 'rect'
      }
      if (placed.some(p => rectsOverlap(p, candidate))) continue
      placedThis = candidate
      break
    }
    // Se 80 tentativi non bastano, fallback su scan deterministico della griglia.
    if (!placedThis) {
      placedThis = scanFallback(placed, rng)
    }
    placed.push(placedThis)
  }
  return placed
}

function scanFallback(
  placed: GeneratedAreaShape[],
  rng: () => number
): GeneratedAreaShape {
  // Scan a passi di 20px finché non trova un buco.
  const step = 20
  // L'ordine di scan è perturbato dal PRNG per non collidere col determinismo
  // di output: comunque, se serve fallback il PRNG ha già consumato esattamente
  // gli stessi numeri tra run.
  const offset = Math.floor(rng() * step)
  for (let y = 5 + offset; y <= VIEWBOX_H - AREA_H - 5; y += step) {
    for (let x = 5 + offset; x <= VIEWBOX_W - AREA_W - 5; x += step) {
      const candidate: GeneratedAreaShape = {
        x,
        y,
        w: AREA_W,
        h: AREA_H,
        kind: 'rect'
      }
      if (!placed.some(p => rectsOverlap(p, candidate))) {
        return candidate
      }
    }
  }
  // Estremo: ritorna comunque qualcosa nel viewBox (non dovrebbe accadere
  // con count ≤ 15 e pochi conflitti, ma evita di lanciare).
  return { x: 5, y: 5, w: AREA_W, h: AREA_H, kind: 'rect' }
}

/**
 * Calcola adjacency simmetrica usando la soglia di distanza tra centri.
 * Garantisce connettività via BFS dalla piazza: per ogni componente isolata
 * aggiunge un edge verso l'area visited più vicina.
 */
function buildAdjacency(areas: GeneratedArea[]): Record<string, string[]> {
  const adj: Record<string, Set<string>> = {}
  for (const a of areas) adj[a.id] = new Set()

  const centers = areas.map(a => ({ id: a.id, ...shapeCenter(a.shape) }))
  for (let i = 0; i < centers.length; i++) {
    for (let j = i + 1; j < centers.length; j++) {
      const a = centers[i]!
      const b = centers[j]!
      if (distance(a, b) <= ADJACENCY_THRESHOLD) {
        adj[a.id]!.add(b.id)
        adj[b.id]!.add(a.id)
      }
    }
  }

  const spawnId = areas.find(a => a.spawn)!.id

  // Connettività: BFS, se rimangono componenti isolate aggiungi edge col
  // visited più vicino (deterministico: scan in ordine areas[]).
  while (true) {
    const visited = new Set<string>([spawnId])
    const queue: string[] = [spawnId]
    while (queue.length > 0) {
      const node = queue.shift()!
      for (const n of adj[node]!) {
        if (!visited.has(n)) {
          visited.add(n)
          queue.push(n)
        }
      }
    }
    if (visited.size === areas.length) break

    // Trova la prima area non visitata e collegala al visited più vicino.
    const unvisited = areas.find(a => !visited.has(a.id))!
    const uCenter = shapeCenter(unvisited.shape)
    let bestId: string | null = null
    let bestDist = Infinity
    for (const a of areas) {
      if (!visited.has(a.id)) continue
      const d = distance(uCenter, shapeCenter(a.shape))
      if (d < bestDist) {
        bestDist = d
        bestId = a.id
      }
    }
    if (bestId === null) break
    adj[unvisited.id]!.add(bestId)
    adj[bestId]!.add(unvisited.id)
  }

  // Converte Set→array ordinato per stabilità dell'output.
  const out: Record<string, string[]> = {}
  for (const a of areas) {
    out[a.id] = Array.from(adj[a.id]!).sort()
  }
  return out
}

/**
 * Sceglie 2-4 aree da marcare come edge tra quelle vicine ai bordi del
 * viewBox. Esclude la piazza (spawn). Se le candidate "naturali" sono
 * meno di 2, completa con le aree più lontane dal centro.
 */
function pickEdgeAreas(rng: () => number, areas: GeneratedArea[]): string[] {
  const center = { x: VIEWBOX_W / 2, y: VIEWBOX_H / 2 }
  const candidates = areas
    .filter(a => !a.spawn && isEdgeShape(a.shape))
    .map(a => a.id)
  const targetCount = 2 + Math.floor(rng() * 3) // 2..4

  let pool: string[]
  if (candidates.length >= targetCount) {
    pool = shuffle(rng, candidates).slice(0, targetCount)
  } else {
    // Completa con aree più lontane dal centro (deterministico).
    const fallback = areas
      .filter(a => !a.spawn && !candidates.includes(a.id))
      .map(a => ({
        id: a.id,
        d: distance(center, shapeCenter(a.shape))
      }))
      .sort((x, y) => y.d - x.d)
      .map(e => e.id)
    pool = [...candidates, ...fallback].slice(0, Math.max(2, targetCount))
  }
  return pool.sort()
}

export const city: GeneratorFn = (seed: string, params: GenParams): GeneratedMap => {
  const rng = mulberry32(seedFromString(seed))

  const densityRaw = typeof params.density === 'number' ? params.density : 0.5
  const density = clamp(densityRaw, 0, 1)
  const areaCount = Math.round(lerp(AREA_COUNT_MIN, AREA_COUNT_MAX, density))

  // Pesca i nomi: piazza prima, poi shuffle del pool building + open extras.
  const themePool = shuffle(rng, [...BUILDING_NAMES, ...OPEN_NAME_POOL])
  const names = ['Town Square']
  for (let i = 1; i < areaCount; i++) {
    names.push(themePool[(i - 1) % themePool.length]!)
  }

  const shapes = placeAreas(rng, areaCount, names)

  const usedIds = new Set<string>()
  const areas: GeneratedArea[] = []
  for (let i = 0; i < areaCount; i++) {
    const name = names[i]!
    let baseId = i === 0 ? slugify(name) : `${slugify(name)}_${i}`
    // Garantisce univocità anche con duplicati di nome (shouldn't happen,
    // ma il pool potrebbe esaurirsi su areaCount alti → modulo ripete).
    let suffix = 0
    while (usedIds.has(baseId)) {
      suffix++
      baseId = `${slugify(name)}_${i}_${suffix}`
    }
    usedIds.add(baseId)
    const shape = organicizeShape(rng, shapes[i]!)
    areas.push(buildArea(baseId, name, shape, rng, i === 0))
  }

  const adjacency = buildAdjacency(areas)

  const edgeIds = new Set(pickEdgeAreas(rng, areas))
  for (const a of areas) {
    a.edge = edgeIds.has(a.id)
  }

  const spawnArea = areas[0]!

  return {
    areas,
    adjacency,
    spawnAreaId: spawnArea.id,
    edgeAreaIds: Array.from(edgeIds).sort(),
    background: { kind: 'gradient', from: '#1a1a1a', to: '#2c2c2c' }
  }
}
