import type { GeneratedMap, GeneratedArea } from './generators/types'

// Centroid threshold (in coord logiche 1000x700) per dichiarare due aree
// adiacenti by-proximity automatica. Stesso valore usato dal client per
// disegnare le strade auto e dal server per validare i movimenti.
export const ADJ_THRESHOLD = 280

export interface AreaOverrideInput {
  mapId: string
  areaId: string
  customName: string | null
  x: number | null
  y: number | null
  w: number | null
  h: number | null
  removed: boolean
  customAdded: boolean
}

export interface AdjacencyOverrideInput {
  mapId: string
  areaA: string
  areaB: string
  kind: 'add' | 'remove' | 'broken'
  roadKind: string | null
}

/**
 * Applica gli override master a una lista di aree base (output del
 * generator deterministico): rinomina, sposta, segna come rimosse,
 * aggiunge le custom-added.
 */
export function applyAreaOverrides(
  base: readonly GeneratedArea[],
  overrides: ReadonlyArray<AreaOverrideInput>
): GeneratedArea[] {
  const byArea = new Map(overrides.map(o => [o.areaId, o]))
  const out: GeneratedArea[] = []
  for (const a of base) {
    const o = byArea.get(a.id)
    if (o?.removed) continue
    if (!o) {
      out.push(a)
      continue
    }
    out.push({
      ...a,
      name: o.customName ?? a.name,
      shape: {
        ...a.shape,
        x: o.x ?? a.shape.x,
        y: o.y ?? a.shape.y,
        w: o.w ?? a.shape.w,
        h: o.h ?? a.shape.h
      }
    })
  }
  for (const o of overrides) {
    if (!o.customAdded) continue
    if (o.removed) continue
    out.push({
      id: o.areaId,
      name: o.customName ?? 'Senza nome',
      shape: {
        kind: 'rect',
        x: o.x ?? 100,
        y: o.y ?? 100,
        w: o.w ?? 120,
        h: o.h ?? 90
      },
      edge: false,
      spawn: false,
      decor: [],
      detail: { layout: 'open', width: 800, height: 600, props: [] }
    })
  }
  return out
}

/**
 * Calcola adjacency by-proximity sulle posizioni *correnti* delle aree
 * (dopo applyAreaOverrides) e applica gli adjacency override:
 * - 'add'    → coppia inserita
 * - 'remove' → coppia tolta (sopprime auto)
 * - 'broken' → coppia inserita lato visibilità (per l'utente la strada
 *   esiste e si vede), ma viene marcata come non attraversabile —
 *   esposta in `brokenPairs` per chi controlla la reachability.
 *
 * Ritorna sia l'adjacency "completa" (per disegnare le strade) sia il
 * sottoinsieme degli edge attualmente *intransitabili*.
 */
export interface EffectiveAdjacency {
  /** Adjacency completa: include le strade auto, le 'add', e anche le
   *  'broken' (perché visivamente la strada c'è). */
  visibleAdj: Record<string, string[]>
  /** Sottoinsieme di visibleAdj: edge bloccati per il movimento. Coppia
   *  normalizzata "a::b" con a < b. */
  brokenPairs: Set<string>
}

export function buildEffectiveAdjacency(
  areas: readonly GeneratedArea[],
  overrides: ReadonlyArray<AdjacencyOverrideInput>
): EffectiveAdjacency {
  const adj: Record<string, Set<string>> = {}
  for (const a of areas) adj[a.id] = new Set()
  for (let i = 0; i < areas.length; i++) {
    for (let j = i + 1; j < areas.length; j++) {
      const a = areas[i]!
      const b = areas[j]!
      const ax = a.shape.x + a.shape.w / 2
      const ay = a.shape.y + a.shape.h / 2
      const bx = b.shape.x + b.shape.w / 2
      const by = b.shape.y + b.shape.h / 2
      if (Math.hypot(bx - ax, by - ay) <= ADJ_THRESHOLD) {
        adj[a.id]!.add(b.id)
        adj[b.id]!.add(a.id)
      }
    }
  }
  const validIds = new Set(areas.map(a => a.id))
  const brokenPairs = new Set<string>()
  for (const o of overrides) {
    if (!validIds.has(o.areaA) || !validIds.has(o.areaB)) continue
    if (o.kind === 'add' || o.kind === 'broken') {
      adj[o.areaA]!.add(o.areaB)
      adj[o.areaB]!.add(o.areaA)
      if (o.kind === 'broken') {
        const [a, b] = o.areaA < o.areaB ? [o.areaA, o.areaB] : [o.areaB, o.areaA]
        brokenPairs.add(`${a}::${b}`)
      }
    } else {
      // 'remove'
      adj[o.areaA]?.delete(o.areaB)
      adj[o.areaB]?.delete(o.areaA)
    }
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(adj)) out[k] = Array.from(adj[k]!)
  return { visibleAdj: out, brokenPairs }
}

/**
 * Combina applyAreaOverrides + buildEffectiveAdjacency per restituire
 * una `GeneratedMap` effettiva (areas patched, adjacency completa).
 * NON include `brokenPairs` perché GeneratedMap è il contratto di
 * rendering pubblico — usa `buildEffectiveAdjacency` direttamente quando
 * serve la lista degli edge bloccati.
 */
export function buildEffectiveMap(
  base: GeneratedMap,
  areaOverrides: ReadonlyArray<AreaOverrideInput>,
  adjacencyOverrides: ReadonlyArray<AdjacencyOverrideInput>
): GeneratedMap {
  const patchedAreas = applyAreaOverrides(base.areas, areaOverrides)
  const { visibleAdj } = buildEffectiveAdjacency(patchedAreas, adjacencyOverrides)
  const visibleIds = new Set(patchedAreas.map(a => a.id))
  const spawnAreaId = visibleIds.has(base.spawnAreaId)
    ? base.spawnAreaId
    : (patchedAreas[0]?.id ?? base.spawnAreaId)
  const edgeAreaIds = base.edgeAreaIds.filter(id => visibleIds.has(id))
  return {
    areas: patchedAreas,
    adjacency: visibleAdj,
    spawnAreaId,
    edgeAreaIds,
    background: base.background
  }
}

/** Helper per chiavi normalizzate (a < b). */
export function pairKey(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}
