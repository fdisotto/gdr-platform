import type { GeneratedAreaShape } from './types'

// v2d-shape: trasforma una shape rect (bbox) in un poligono organico
// che mantiene **lo stesso bounding box**. I `points` sono in coord
// relative alla bbox top-left, così il rendering può continuare a usare
// `<g transform="translate(x,y)">` come fa per i rect. Il bbox resta
// invariato così tutti i calcoli a valle (adjacency da centri, edge
// detection, transition doors, drag) restano coerenti.
//
// Algoritmo: N=10-12 vertici distribuiti su un'ellisse iscritta nella
// bbox, con jitter angolare e radiale via PRNG. Il primo/ultimo vertice
// non si sovrappongono (poligono chiuso semplice).
export function organicizeShape(
  rng: () => number,
  shape: GeneratedAreaShape
): GeneratedAreaShape {
  if (shape.kind === 'polygon' && shape.points) return shape
  const cx = shape.w / 2
  const cy = shape.h / 2
  const baseRX = shape.w / 2
  const baseRY = shape.h / 2
  // Sides 10-12: abbastanza per look "blob organico" senza essere pesante.
  const sides = 10 + Math.floor(rng() * 3)
  const angularSlot = (Math.PI * 2) / sides
  // Jitter angolare ≤ 30% dello slot per non causare auto-incroci del
  // poligono (gli angoli restano monotoni).
  const angularJitter = 0.30 * angularSlot
  // Jitter radiale: 70..100% del raggio base (sempre positivo, evita
  // "incursioni" verso l'interno troppo profonde).
  const radialMin = 0.70
  const radialMax = 1.00
  const pts: string[] = []
  for (let i = 0; i < sides; i++) {
    const baseAngle = i * angularSlot
    const jitter = (rng() - 0.5) * 2 * angularJitter
    const angle = baseAngle + jitter
    const r = radialMin + rng() * (radialMax - radialMin)
    const px = cx + Math.cos(angle) * baseRX * r
    const py = cy + Math.sin(angle) * baseRY * r
    pts.push(`${px.toFixed(1)},${py.toFixed(1)}`)
  }
  return {
    kind: 'polygon',
    x: shape.x,
    y: shape.y,
    w: shape.w,
    h: shape.h,
    points: pts.join(' ')
  }
}
