import { computed, type ComputedRef } from 'vue'
import { Delaunay } from 'd3-delaunay'

// v2d-shape-B: tessellation Voronoi delle aree. Dato l'elenco delle aree
// (con centroide derivato dal bbox) e i bound del viewBox, calcola il
// poligono Voronoi di ognuna. Le regioni risultanti riempiono completamente
// il viewBox e condividono confini → look "cartina politica".
//
// Subdivision: ogni edge condiviso fra due celle viene suddiviso in N
// segmenti con jitter perpendicolare deterministico (PRNG seedato sui
// vertici dell'edge). Le due celle vedono lo stesso edge perturbato in
// modo coerente. Edge sui bordi del viewBox (clip) restano diritti.

interface AreaLike {
  id: string
  shape: { x: number, y: number, w: number, h: number }
}

const SUBDIVISIONS = 4 // punti intermedi per edge (oltre ai 2 endpoint)
const JITTER_AMPLITUDE = 8 // ±unità logiche perpendicolari all'edge
const VIEWBOX_EPS = 0.5 // tolleranza per riconoscere "vertice sul bordo"

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function rngFromHash(h: number): () => number {
  let a = h
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function isOnBorder(x: number, y: number, viewBoxW: number, viewBoxH: number): boolean {
  return x <= VIEWBOX_EPS || x >= viewBoxW - VIEWBOX_EPS
    || y <= VIEWBOX_EPS || y >= viewBoxH - VIEWBOX_EPS
}

// Ritorna i punti intermedi (subdiv) di un edge da p1 a p2, in ordine
// p1 → p2. Se l'edge è sul bordo del viewBox, niente jitter (mantiene
// dritto il clip). PRNG deterministic via hash dei vertici normalizzati
// (così cella e cella adiacente vedono gli stessi punti).
function subdivideEdge(
  p1: [number, number],
  p2: [number, number],
  viewBoxW: number,
  viewBoxH: number
): Array<[number, number]> {
  const onBorder1 = isOnBorder(p1[0], p1[1], viewBoxW, viewBoxH)
  const onBorder2 = isOnBorder(p2[0], p2[1], viewBoxW, viewBoxH)
  // Edge interamente sul bordo → niente jitter (segue il viewBox clip).
  if (onBorder1 && onBorder2) return []
  // Hash deterministic indipendente dall'ordine dei vertici.
  const a = p1[0] < p2[0] || (p1[0] === p2[0] && p1[1] < p2[1]) ? p1 : p2
  const b = a === p1 ? p2 : p1
  const key = `${a[0].toFixed(2)},${a[1].toFixed(2)}_${b[0].toFixed(2)},${b[1].toFixed(2)}`
  const rng = rngFromHash(hashStr(key))
  // Direzione e perpendicolare unitaria.
  const dx = p2[0] - p1[0]
  const dy = p2[1] - p1[1]
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  // Genera SUBDIVISIONS punti intermedi a t=1/(N+1)..N/(N+1) lungo l'edge,
  // sempre in direzione canonica (a → b), poi inverte se il caller chiede
  // l'edge p1 → p2 con p1 == b.
  const canonicalPts: Array<[number, number]> = []
  for (let i = 1; i <= SUBDIVISIONS; i++) {
    const t = i / (SUBDIVISIONS + 1)
    const baseX = a[0] + (b[0] - a[0]) * t
    const baseY = a[1] + (b[1] - a[1]) * t
    // Jitter perpendicolare: clamp magari leggermente vicino agli endpoint
    // (taper ai bordi per evitare spike alla giuntura).
    const taper = Math.sin(t * Math.PI) // 0 ai bordi, 1 al centro
    const amp = JITTER_AMPLITUDE * taper
    const j = (rng() - 0.5) * 2 * amp
    canonicalPts.push([baseX + nx * j, baseY + ny * j])
  }
  // Se chiamiamo con p1 == a, restituisci canonicalPts; altrimenti inverti
  // così l'output è sempre da p1 a p2.
  if (a === p1) return canonicalPts
  return canonicalPts.slice().reverse()
}

export function useVoronoiPolygons(
  areas: ComputedRef<readonly AreaLike[]>,
  viewBoxW: number,
  viewBoxH: number
): ComputedRef<Map<string, string>> {
  return computed(() => {
    const out = new Map<string, string>()
    const list = areas.value
    if (list.length < 2) {
      if (list.length === 1) {
        const a = list[0]!
        const pts = `0,0 ${viewBoxW},0 ${viewBoxW},${viewBoxH} 0,${viewBoxH}`
        out.set(a.id, pts)
      }
      return out
    }
    const points: number[] = []
    for (const a of list) {
      points.push(a.shape.x + a.shape.w / 2)
      points.push(a.shape.y + a.shape.h / 2)
    }
    const delaunay = new Delaunay(Float64Array.from(points))
    const voronoi = delaunay.voronoi([0, 0, viewBoxW, viewBoxH])
    for (let i = 0; i < list.length; i++) {
      const cell = voronoi.cellPolygon(i)
      if (!cell) continue
      // cell è Array<[x, y]> chiuso (primo === ultimo).
      const verts = cell.slice(0, -1) as Array<[number, number]>
      const expanded: Array<[number, number]> = []
      for (let j = 0; j < verts.length; j++) {
        const v = verts[j]!
        const next = verts[(j + 1) % verts.length]!
        expanded.push(v)
        const inter = subdivideEdge(v, next, viewBoxW, viewBoxH)
        for (const p of inter) expanded.push(p)
      }
      const pts = expanded.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
      out.set(list[i]!.id, pts)
    }
    return out
  })
}
