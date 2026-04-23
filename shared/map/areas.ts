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

export const ADJACENCY: Record<AreaId, AreaId[]> = {
  piazza: ['chiesa', 'polizia', 'supermercato', 'giardino', 'case'],
  giardino: ['piazza', 'scuola', 'case'],
  supermercato: ['piazza', 'benzinaio', 'case'],
  ospedale: ['scuola', 'fogne', 'case'],
  chiesa: ['piazza', 'scuola', 'fogne'],
  polizia: ['piazza', 'benzinaio', 'case'],
  scuola: ['giardino', 'ospedale', 'chiesa'],
  rifugio: ['fogne', 'porto'],
  benzinaio: ['supermercato', 'polizia', 'ponte'],
  case: ['piazza', 'giardino', 'supermercato', 'ospedale', 'polizia'],
  fogne: ['ospedale', 'chiesa', 'rifugio'],
  porto: ['rifugio', 'ponte', 'radio'],
  radio: ['porto', 'ponte'],
  ponte: ['benzinaio', 'porto', 'radio']
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
