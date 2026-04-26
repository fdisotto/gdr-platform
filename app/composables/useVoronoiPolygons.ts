import { computed, type ComputedRef } from 'vue'
import { Delaunay } from 'd3-delaunay'

// v2d-shape-B: tessellation Voronoi delle aree. Dato l'elenco delle aree
// (con centroide derivato dal bbox) e i bound del viewBox, calcola il
// poligono Voronoi di ognuna. Le regioni risultanti riempiono completamente
// il viewBox e condividono confini → look "cartina politica".
//
// Input: aree con shape.x/y/w/h (centroide = centro bbox).
// Output: Map<areaId, pointsString> — i punti SVG sono in coord assolute
// del viewBox (NON relative al bbox), così MapArea può ignorare il
// transform translate(x,y) e renderizzare direttamente.

interface AreaLike {
  id: string
  shape: { x: number, y: number, w: number, h: number }
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
      // Voronoi richiede ≥ 2 punti; con 1 solo punto la cella è tutta la
      // bbox. Fallback: rettangolo intero.
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
      // cell è Array<[x, y]> chiuso (primo === ultimo). SVG accetta points
      // senza chiusura esplicita.
      const pts = cell.slice(0, -1).map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
      out.set(list[i]!.id, pts)
    }
    return out
  })
}
