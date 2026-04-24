export const AREA_IDS = [
  'piazza', 'giardino', 'supermercato', 'ospedale', 'chiesa',
  'polizia', 'scuola', 'rifugio', 'benzinaio', 'case',
  'fogne', 'porto', 'radio', 'ponte'
] as const

export type AreaId = typeof AREA_IDS[number]

export interface AreaSvg {
  x: number
  y: number
  w: number
  h: number
  shape: 'rect' | 'polygon'
  points?: string
}

export interface Area {
  id: AreaId
  name: string
  svg: AreaSvg
}

// Layout logico su viewBox 1000x700; coordinate approssimative per MVP, rifinite
// quando il componente GameMap verrà disegnato nel Plan 3.
export const AREAS: readonly Area[] = [
  { id: 'piazza', name: 'Piazza Centrale', svg: { x: 440, y: 300, w: 120, h: 100, shape: 'rect' } },
  { id: 'giardino', name: 'Giardino', svg: { x: 280, y: 310, w: 140, h: 90, shape: 'rect' } },
  { id: 'supermercato', name: 'Supermercato', svg: { x: 580, y: 310, w: 140, h: 90, shape: 'rect' } },
  { id: 'ospedale', name: 'Ospedale', svg: { x: 740, y: 120, w: 160, h: 110, shape: 'rect' } },
  { id: 'chiesa', name: 'Chiesa', svg: { x: 360, y: 140, w: 150, h: 110, shape: 'rect' } },
  { id: 'polizia', name: 'Stazione Polizia', svg: { x: 540, y: 140, w: 160, h: 110, shape: 'rect' } },
  { id: 'scuola', name: 'Scuola', svg: { x: 580, y: 10, w: 180, h: 100, shape: 'rect' } },
  { id: 'rifugio', name: 'Rifugio Sotterraneo', svg: { x: 40, y: 500, w: 160, h: 100, shape: 'rect' } },
  { id: 'benzinaio', name: 'Stazione Servizio', svg: { x: 780, y: 420, w: 160, h: 90, shape: 'rect' } },
  { id: 'case', name: 'Quartiere Residenziale', svg: { x: 370, y: 430, w: 260, h: 100, shape: 'rect' } },
  { id: 'fogne', name: 'Fogne', svg: { x: 210, y: 560, w: 300, h: 90, shape: 'rect' } },
  { id: 'porto', name: 'Porto', svg: { x: 230, y: 440, w: 120, h: 90, shape: 'rect' } },
  { id: 'radio', name: 'Radio-Torre', svg: { x: 70, y: 280, w: 150, h: 110, shape: 'rect' } },
  { id: 'ponte', name: 'Ponte', svg: { x: 860, y: 560, w: 120, h: 90, shape: 'rect' } }
]

// Adjacency "a corto raggio": ogni collegamento ha senso geografico, niente
// strade che attraversano diagonalmente tutta la mappa passando sopra altre
// zone. Il grafo resta connesso (BFS da piazza raggiunge tutte le 14 zone).
export const ADJACENCY: Record<AreaId, AreaId[]> = {
  piazza: ['chiesa', 'polizia', 'supermercato', 'giardino', 'case'],
  giardino: ['piazza', 'chiesa'],
  supermercato: ['piazza', 'polizia', 'benzinaio'],
  ospedale: ['polizia', 'scuola'],
  chiesa: ['piazza', 'giardino', 'scuola'],
  polizia: ['piazza', 'supermercato', 'ospedale', 'case'],
  scuola: ['chiesa', 'ospedale'],
  rifugio: ['fogne', 'porto'],
  benzinaio: ['supermercato', 'case', 'ponte'],
  case: ['piazza', 'polizia', 'benzinaio', 'fogne'],
  fogne: ['case', 'rifugio', 'porto'],
  porto: ['fogne', 'rifugio', 'ponte', 'radio'],
  radio: ['porto'],
  ponte: ['benzinaio', 'porto']
}

export function areaCenter(area: Area): { x: number, y: number } {
  return {
    x: area.svg.x + area.svg.w / 2,
    y: area.svg.y + area.svg.h / 2
  }
}

export function exitPoint(area: Area, target: { x: number, y: number }): { x: number, y: number } {
  const cx = area.svg.x + area.svg.w / 2
  const cy = area.svg.y + area.svg.h / 2
  const dx = target.x - cx
  const dy = target.y - cy
  const halfW = area.svg.w / 2
  const halfH = area.svg.h / 2
  const tX = Math.abs(dx) > 0.001 ? halfW / Math.abs(dx) : Infinity
  const tY = Math.abs(dy) > 0.001 ? halfH / Math.abs(dy) : Infinity
  const t = Math.min(tX, tY)
  return { x: cx + dx * t, y: cy + dy * t }
}

// Coppie uniche di aree adiacenti (per disegnare strade senza duplicati).
// Es. (piazza, chiesa) è la stessa di (chiesa, piazza), appare una volta.
export function uniqueAdjacencyPairs(): Array<[AreaId, AreaId]> {
  const seen = new Set<string>()
  const pairs: Array<[AreaId, AreaId]> = []
  for (const a of AREA_IDS) {
    for (const b of ADJACENCY[a]) {
      const key = [a, b].sort().join('::')
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([a, b])
    }
  }
  return pairs
}

export function isAreaId(value: unknown): value is AreaId {
  return typeof value === 'string' && (AREA_IDS as readonly string[]).includes(value)
}

export function areAdjacent(a: AreaId, b: AreaId): boolean {
  return ADJACENCY[a].includes(b)
}

export function reachableFrom(start: AreaId, maxHops: number): Set<AreaId> {
  const visited = new Set<AreaId>([start])
  let frontier: AreaId[] = [start]
  for (let hop = 0; hop < maxHops; hop++) {
    const next: AreaId[] = []
    for (const node of frontier) {
      for (const neigh of ADJACENCY[node]) {
        if (!visited.has(neigh)) {
          visited.add(neigh)
          next.push(neigh)
        }
      }
    }
    if (next.length === 0) break
    frontier = next
  }
  return visited
}
