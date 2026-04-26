/**
 * Generator deterministico per mappe di tipo "wasteland".
 *
 * Dato (seed, params) produce una `GeneratedMap` riproducibile bit-per-bit
 * con tema post-apocalittico/desertico: rovine, crateri, accampamenti,
 * bunker e dune. Lo spawn è un Accampamento o un Avamposto (entrambi layout
 * "open"), bilanciato con un coin flip dal PRNG.
 *
 * Pattern speculare a `city.ts` e `country.ts`: stesso scaffolding (slugify,
 * lerp, BFS, placeAreas) ma pool di nomi/decor a tema wasteland e
 * composizione del pool pesata da `ruinRatio` (rovine) e `craterCount`
 * (crateri). Lo schema `GeneratedArea` non ha un flag "closed" → i crateri
 * sono marcati semantically dal nome (`Cratere*`) e dai decor `crater`.
 * Nessuna factorizzazione condivisa preventiva — verrà valutata in T6.
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

const AREA_COUNT_MIN = 6
const AREA_COUNT_MAX = 12

// Dimensioni shape area: leggermente più ampie del city per evocare
// distese aperte; comparabili a country.
const AREA_W = 145
const AREA_H = 95
const AREA_PADDING = 14

// Soglia distanza centri per considerare due aree adiacenti.
// Tra city (250) e country (320): wasteland ha una rete media-rada.
const ADJACENCY_THRESHOLD = 290

// ViewBox del detail (interno area).
const DETAIL_W = 800
const DETAIL_H = 600

// Centro spawn (Accampamento/Avamposto) sul viewBox principale.
const SPAWN_W = 165
const SPAWN_H = 115
const SPAWN_X = Math.round((VIEWBOX_W - SPAWN_W) / 2)
const SPAWN_Y = Math.round((VIEWBOX_H - SPAWN_H) / 2)

// Default per parametri non specificati.
const DEFAULT_RUIN_RATIO = 0.5
const DEFAULT_CRATER_COUNT = 2

// Nomi spawn post-disastro US "The Walking Dead" style (layout open).
const SPAWN_NAME = 'Camp Sherman'
const ALT_SPAWN_NAME = 'Outpost Echo'

// Crateri: nomi tipo TWD, geografici US.
const CRATER_NAME = 'Atlanta Blast Crater'
const CRATER_RAD_NAME = 'Savannah Fallout Pit'

// Aree con nome che inizia per "Crater" (per filtri test/registry).
const CRATER_NAMES = [CRATER_NAME, CRATER_RAD_NAME] as const

const RUIN_NAME = 'Downtown Ruins'

// Pool nomi "open" generici (non spawn, non rovine, non crateri).
const OPEN_NAMES_POOL = [
  'Mojave Dunes',
  'Sutter County Dump',
  'I-95 Wreckage',
  'Old Trench Line',
  'Cracked Highway',
  'Burnt Plains'
] as const

// Pool nomi "building" (chiusi). Includono lo spawn alt come building?
// No: l'Outpost Echo è gestito come spawn alt e non finisce nel pool building.
const BUILDING_NAMES_POOL = [
  'NORAD Bunker',
  'Highway 9 Roadblock',
  'Abandoned Hangar',
  'Ruined Barracks'
] as const

// Pool nomi "crossing".
const CROSSING_NAME = 'Collapsed Mississippi Bridge'

// Layout 'building' per Bunker/Outpost/Posto di Blocco.
const BUILDING_LAYOUT_NAMES = new Set<string>([
  'NORAD Bunker',
  ALT_SPAWN_NAME,
  'Highway 9 Roadblock',
  'Abandoned Hangar',
  'Ruined Barracks'
])

// Layout 'crossing' per Ponte Sgretolato.
const CROSSING_LAYOUT_NAMES = new Set<string>([CROSSING_NAME])

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
    .replace(/[̀-ͯ]/g, '')
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

function isCraterName(name: string): boolean {
  return name.startsWith(CRATER_NAME)
}

function decorPoolFor(
  layout: GeneratedAreaDetail['layout'],
  name: string
): Array<'crater' | 'ruin' | 'bone' | 'wreck' | 'barricade' | 'radiation'> {
  if (name === CRATER_RAD_NAME) {
    return ['crater', 'radiation', 'bone', 'radiation']
  }
  if (isCraterName(name)) {
    return ['crater', 'bone', 'wreck', 'crater']
  }
  if (name === RUIN_NAME) {
    return ['ruin', 'barricade', 'wreck', 'ruin']
  }
  if (layout === 'crossing') {
    return ['barricade', 'wreck', 'ruin', 'bone']
  }
  if (layout === 'building') {
    return ['barricade', 'wreck', 'ruin', 'bone']
  }
  // open generico (Dune/Discarica/Carcassa/Trincea/Accampamento/Avamposto).
  return ['wreck', 'bone', 'barricade', 'ruin']
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
  if (CROSSING_LAYOUT_NAMES.has(name)) return 'crossing'
  if (spawn) return 'open'
  if (BUILDING_LAYOUT_NAMES.has(name)) return 'building'
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
 * Costruisce il pool ordinato dei nomi per le aree non-spawn applicando:
 *   1. allocazione fissa di slot crateri (min(craterCount, count-1));
 *   2. quota Rovine pesata da ruinRatio (almeno 1 se ratio > 0);
 *   3. riempimento con building + open shuffleati.
 *
 * Il pool restituito ha lunghezza esatta `count - 1` (le aree non-spawn).
 * I crateri alternano `Cratere` e `Cratere Radiazioni` per varietà tematica.
 */
function buildNamePool(
  rng: () => number,
  count: number,
  ruinRatio: number,
  craterCount: number
): string[] {
  const pool: string[] = []
  const slotsTotal = Math.max(0, count - 1)

  // 1. Crateri: allocati prima, fino a min(craterCount, count-1).
  const craterTarget = Math.max(0, Math.min(craterCount, slotsTotal))
  for (let i = 0; i < craterTarget; i++) {
    // Alterna varianti Cratere / Cratere Radiazioni per evitare omogeneità.
    const variant = i % 2 === 0 ? CRATER_NAME : CRATER_RAD_NAME
    pool.push(variant)
  }

  // 2. Rovine: quota proporzionale al ratio sui rimanenti slot.
  const remaining = slotsTotal - pool.length
  const ruinTarget = ruinRatio > 0
    ? Math.max(1, Math.round(remaining * ruinRatio))
    : 0
  const ruinCount = Math.min(ruinTarget, remaining)
  for (let i = 0; i < ruinCount; i++) pool.push(RUIN_NAME)

  // 3. Riempimento con building + open + crossing shuffleati.
  const themePool = shuffle(rng, [
    ...BUILDING_NAMES_POOL,
    ...OPEN_NAMES_POOL,
    CROSSING_NAME
  ])
  let cursor = 0
  while (pool.length < slotsTotal) {
    pool.push(themePool[cursor % themePool.length]!)
    cursor++
  }

  // Shuffle finale per non avere sempre crateri/rovine in testa.
  return shuffle(rng, pool)
}

/**
 * Posiziona le aree su una griglia 4x3 perturbata. Riserva il centro allo
 * spawn. Per ogni area tenta `attempts` posizioni con jitter evitando overlap.
 */
function placeAreas(
  rng: () => number,
  count: number
): GeneratedAreaShape[] {
  const placed: GeneratedAreaShape[] = []
  // Spawn centrale.
  placed.push({
    x: SPAWN_X,
    y: SPAWN_Y,
    w: SPAWN_W,
    h: SPAWN_H,
    kind: 'rect'
  })

  const cellsX = 4
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
 * Sceglie 4-6 aree edge tra quelle vicine ai bordi, escluso lo spawn.
 * Se le candidate naturali non bastano, completa con le aree più lontane
 * dal centro (deterministico). Wasteland predilige tante uscite verso il
 * "deserto esterno" rispetto a city/country.
 */
function pickEdgeAreas(rng: () => number, areas: GeneratedArea[]): string[] {
  const center = { x: VIEWBOX_W / 2, y: VIEWBOX_H / 2 }
  const candidates = areas
    .filter(a => !a.spawn && isEdgeShape(a.shape))
    .map(a => a.id)
  const targetCount = 4 + Math.floor(rng() * 3) // 4..6

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
    pool = [...candidates, ...fallback].slice(0, Math.max(4, targetCount))
  }
  // Cap finale: non superiamo il numero di non-spawn disponibili.
  const maxAvailable = areas.filter(a => !a.spawn).length
  return pool.slice(0, Math.min(pool.length, maxAvailable)).sort()
}

export const wasteland: GeneratorFn = (
  seed: string,
  params: GenParams
): GeneratedMap => {
  const rng = mulberry32(seedFromString(seed))

  // areaCount governato da `density` lerp [6..12]; ruinRatio e craterCount
  // influenzano solo la composizione del pool nomi.
  const densityRaw = typeof params.density === 'number' ? params.density : 0.5
  const density = clamp(densityRaw, 0, 1)
  const areaCount = Math.round(lerp(AREA_COUNT_MIN, AREA_COUNT_MAX, density))

  const ruinRatioRaw = typeof params.ruinRatio === 'number'
    ? params.ruinRatio
    : DEFAULT_RUIN_RATIO
  const ruinRatio = clamp(ruinRatioRaw, 0, 1)

  const craterCountRaw = typeof params.craterCount === 'number'
    ? params.craterCount
    : DEFAULT_CRATER_COUNT
  // Cap superiore difensivo: non più di areaCount-1 crateri per non
  // saturare il pool delle aree non-spawn.
  const craterCount = Math.max(0, Math.floor(craterCountRaw))

  // Pool nomi: prima area sempre lo spawn (Accampamento o Avamposto), poi
  // pool pesato. Coin flip dal PRNG per alternare tra le due varianti spawn.
  const spawnName = rng() < 0.5 ? SPAWN_NAME : ALT_SPAWN_NAME
  const namePool = buildNamePool(rng, areaCount, ruinRatio, craterCount)
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
    background: { kind: 'gradient', from: '#2c1d12', to: '#3a2f25' }
  }
}

// Utility export-only per i test (filtri tassonomici sui nomi).
export const WASTELAND_CRATER_NAMES: readonly string[] = CRATER_NAMES
