/**
 * Generator deterministico per mappe di tipo "country".
 *
 * Dato (seed, params) produce una `GeneratedMap` riproducibile bit-per-bit
 * con tema rurale/agricolo: fattorie, stalle, boschi, sentieri ed eventuale
 * fiume con ponte. La piazza centrale del city diventa qui un casolare/fattoria
 * di spawn. Layout: viewBox 1000x700, griglia perturbata più rada.
 *
 * Pattern speculare a `city.ts`: stesso scaffolding (slugify, lerp, BFS,
 * placeAreas) ma pool di nomi/decor a tema country e composizione del pool
 * pesata da `forestRatio`/`riverChance`. Nessuna factorizzazione condivisa
 * preventiva — verrà valutata in T6 con il registry.
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

const VIEWBOX_W = 1000
const VIEWBOX_H = 700

const AREA_COUNT_MIN = 6
const AREA_COUNT_MAX = 10

// Dimensioni shape area: leggermente più larghe del city per evocare
// "appezzamenti" più radi.
const AREA_W = 150
const AREA_H = 100
const AREA_PADDING = 16

// Soglia distanza centri per considerare due aree adiacenti.
// Più alta del city perché la griglia è più rada.
const ADJACENCY_THRESHOLD = 320

// ViewBox del detail (interno area).
const DETAIL_W = 800
const DETAIL_H = 600

// Centro casolare (spawn) sul viewBox principale.
const SPAWN_W = 170
const SPAWN_H = 120
const SPAWN_X = Math.round((VIEWBOX_W - SPAWN_W) / 2)
const SPAWN_Y = Math.round((VIEWBOX_H - SPAWN_H) / 2)

// Soglia oltre la quale riverChance forza un fiume + ponte.
const RIVER_THRESHOLD = 0.5

// Default per parametri non specificati.
const DEFAULT_FOREST_RATIO = 0.4
const DEFAULT_RIVER_CHANCE = 0.6

// Pool nomi a tema country (escluso lo spawn name riservato).
const BUILDING_NAMES = [
  'Stalla',
  'Silo',
  'Fienile',
  'Pozzo',
  'Cantina',
  'Mulino'
] as const

const OPEN_NAMES_POOL = [
  'Sentiero',
  'Recinto',
  'Vigneto'
] as const

const FOREST_NAME = 'Bosco'
const RIVER_NAME = 'Fiume'
const BRIDGE_NAME = 'Ponte'
const SPAWN_NAME = 'Casolare'
const ALT_SPAWN_NAME = 'Fattoria'

// Nomi che producono layout "open" (zone all'aperto).
const OPEN_NAMES = new Set<string>([
  ...OPEN_NAMES_POOL,
  FOREST_NAME,
  RIVER_NAME,
  ALT_SPAWN_NAME
])

// Nomi che producono layout "building" (chiusi).
// Casolare è semantica "open" (spawn) e non viene incluso qui.
const BUILDING_NAMES_SET = new Set<string>([...BUILDING_NAMES])

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

function decorPoolFor(
  layout: GeneratedAreaDetail['layout'],
  name: string
): Array<'tree' | 'bush' | 'fence' | 'rock' | 'pond' | 'path'> {
  if (name === RIVER_NAME) {
    return ['pond', 'rock', 'bush', 'pond']
  }
  if (name === BRIDGE_NAME) {
    return ['path', 'rock', 'fence', 'path']
  }
  if (name === FOREST_NAME) {
    return ['tree', 'bush', 'tree', 'rock']
  }
  if (layout === 'building') {
    return ['fence', 'path', 'bush', 'tree']
  }
  // open generico (Sentiero/Recinto/Vigneto/Casolare/Fattoria).
  return ['tree', 'fence', 'bush', 'path']
}

function generateDecor(
  rng: () => number,
  layout: GeneratedAreaDetail['layout'],
  name: string
): GeneratedDecor[] {
  const count = 1 + Math.floor(rng() * 3) // 1..3
  const out: GeneratedDecor[] = []
  const pool = decorPoolFor(layout, name)
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

function layoutFor(
  name: string,
  spawn: boolean
): GeneratedAreaDetail['layout'] {
  if (name === BRIDGE_NAME) return 'crossing'
  if (spawn) return 'open'
  if (OPEN_NAMES.has(name)) return 'open'
  if (BUILDING_NAMES_SET.has(name)) return 'building'
  return 'open'
}

function buildArea(
  id: string,
  name: string,
  shape: GeneratedAreaShape,
  rng: () => number,
  spawn: boolean
): GeneratedArea {
  const layout = layoutFor(name, spawn)
  const detailProps = generateDecor(rng, layout, name)
  const decor = generateDecor(rng, layout, name)
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
  return cx < 220 || cx > 780 || cy < 160 || cy > 540
}

/**
 * Costruisce il pool ordinato dei nomi per le aree non-spawn applicando i
 * pesi di forestRatio (peso Bosco) e l'inserimento forzato di Fiume+Ponte
 * quando riverChance supera la soglia.
 *
 * Il pool restituito contiene almeno `count` elementi: se è più corto, viene
 * ciclicamente ripetuto.
 */
function buildNamePool(
  rng: () => number,
  count: number,
  forestRatio: number,
  riverChance: number
): string[] {
  const pool: string[] = []

  // Inserimento forzato fiume + ponte se richiesto.
  if (riverChance > RIVER_THRESHOLD) {
    pool.push(RIVER_NAME, BRIDGE_NAME)
  }

  // Numero atteso di Bosco proporzionale al ratio (almeno 1 se ratio > 0).
  // count include lo spawn → il pool serve per (count - 1) aree.
  const slots = Math.max(0, count - 1 - pool.length)
  const forestTarget = forestRatio > 0
    ? Math.max(1, Math.round(slots * forestRatio))
    : 0
  for (let i = 0; i < forestTarget; i++) pool.push(FOREST_NAME)

  // Riempi i restanti slot con un mix di building + open shuffleati.
  const themePool = shuffle(rng, [...BUILDING_NAMES, ...OPEN_NAMES_POOL])
  let cursor = 0
  while (pool.length < count - 1) {
    pool.push(themePool[cursor % themePool.length]!)
    cursor++
  }

  // Shuffle finale per non avere sempre Fiume/Ponte/Bosco in testa.
  return shuffle(rng, pool)
}

/**
 * Posiziona le aree su una griglia 3x3 perturbata. Riserva il centro al
 * casolare di spawn. Per ogni area tenta `attempts` posizioni con jitter
 * evitando overlap.
 */
function placeAreas(
  rng: () => number,
  count: number
): GeneratedAreaShape[] {
  const placed: GeneratedAreaShape[] = []
  // Casolare centrale (spawn).
  placed.push({
    x: SPAWN_X,
    y: SPAWN_Y,
    w: SPAWN_W,
    h: SPAWN_H,
    kind: 'rect'
  })

  const cellsX = 3
  const cellsY = 3
  const cellW = VIEWBOX_W / cellsX
  const cellH = VIEWBOX_H / cellsY

  for (let i = 1; i < count; i++) {
    let placedThis: GeneratedAreaShape | null = null
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
  const step = 20
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
  return { x: 5, y: 5, w: AREA_W, h: AREA_H, kind: 'rect' }
}

/**
 * Adjacency simmetrica con soglia distanza, più garanzia di connettività via
 * BFS dallo spawn (collega componenti isolate al visited più vicino).
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

  const out: Record<string, string[]> = {}
  for (const a of areas) {
    out[a.id] = Array.from(adj[a.id]!).sort()
  }
  return out
}

/**
 * Sceglie 3-5 aree edge tra quelle vicine ai bordi, escluso lo spawn.
 * Se le candidate naturali non bastano, completa con le aree più lontane
 * dal centro (deterministico).
 */
function pickEdgeAreas(rng: () => number, areas: GeneratedArea[]): string[] {
  const center = { x: VIEWBOX_W / 2, y: VIEWBOX_H / 2 }
  const candidates = areas
    .filter(a => !a.spawn && isEdgeShape(a.shape))
    .map(a => a.id)
  const targetCount = 3 + Math.floor(rng() * 3) // 3..5

  let pool: string[]
  if (candidates.length >= targetCount) {
    pool = shuffle(rng, candidates).slice(0, targetCount)
  } else {
    const fallback = areas
      .filter(a => !a.spawn && !candidates.includes(a.id))
      .map(a => ({
        id: a.id,
        d: distance(center, shapeCenter(a.shape))
      }))
      .sort((x, y) => y.d - x.d)
      .map(e => e.id)
    pool = [...candidates, ...fallback].slice(0, Math.max(3, targetCount))
  }
  return pool.sort()
}

export const country: GeneratorFn = (
  seed: string,
  params: GenParams
): GeneratedMap => {
  const rng = mulberry32(seedFromString(seed))

  // areaCount governato da `density` (come city), non da forestRatio:
  // forestRatio influenza solo la composizione del pool nomi, non la
  // quantità di aree.
  const densityRaw = typeof params.density === 'number' ? params.density : 0.5
  const density = clamp(densityRaw, 0, 1)
  const areaCount = Math.round(lerp(AREA_COUNT_MIN, AREA_COUNT_MAX, density))

  const forestRatioRaw = typeof params.forestRatio === 'number'
    ? params.forestRatio
    : DEFAULT_FOREST_RATIO
  const forestRatio = clamp(forestRatioRaw, 0, 1)

  const riverChanceRaw = typeof params.riverChance === 'number'
    ? params.riverChance
    : DEFAULT_RIVER_CHANCE
  const riverChance = clamp(riverChanceRaw, 0, 1)

  // Pool nomi: prima area sempre lo spawn (Casolare), poi pool pesato.
  // Alterniamo Casolare/Fattoria sullo spawn in base a un coin flip per
  // rompere l'omogeneità tra mappe — entrambi sono semantica "open".
  const spawnName = rng() < 0.5 ? SPAWN_NAME : ALT_SPAWN_NAME
  const namePool = buildNamePool(rng, areaCount, forestRatio, riverChance)
  const names = [spawnName, ...namePool.slice(0, areaCount - 1)]

  const shapes = placeAreas(rng, areaCount)

  const usedIds = new Set<string>()
  const areas: GeneratedArea[] = []
  for (let i = 0; i < areaCount; i++) {
    const name = names[i]!
    let baseId = i === 0 ? slugify(name) : `${slugify(name)}_${i}`
    let suffix = 0
    while (usedIds.has(baseId)) {
      suffix++
      baseId = `${slugify(name)}_${i}_${suffix}`
    }
    usedIds.add(baseId)
    const shape = shapes[i]!
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
    background: { kind: 'gradient', from: '#1a2419', to: '#2d3a26' }
  }
}
