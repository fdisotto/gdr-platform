import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areaAdjacencyOverrides } from '~~/server/db/schema'

// v2d-edit: override grafo adjacency. Il client calcola le adiacenze base
// dalla prossimità spaziale; questi override aggiungono strade tra aree
// non vicine (kind='add') o rimuovono strade generate automaticamente
// (kind='remove'). La coppia (areaA, areaB) è sempre normalizzata in
// ordine lessicografico, così non esistono righe duplicate per la stessa
// strada simmetrica.

export type RoadKind = 'urban' | 'path' | 'wasteland' | 'highway' | 'bridge'

export interface AdjacencyOverrideRow {
  partySeed: string
  mapId: string
  areaA: string
  areaB: string
  kind: 'add' | 'remove'
  roadKind: RoadKind | null
  createdAt: number
}

export function normalizePair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a]
}

export function listAdjacencyOverridesForParty(db: Db, partySeed: string): AdjacencyOverrideRow[] {
  return db.select().from(areaAdjacencyOverrides)
    .where(eq(areaAdjacencyOverrides.partySeed, partySeed))
    .all() as AdjacencyOverrideRow[]
}

export interface UpsertAdjacencyOverrideInput {
  partySeed: string
  mapId: string
  areaA: string
  areaB: string
  kind: 'add' | 'remove'
  // Stile della strada (solo significativo per kind='add'). Null/undefined
  // → la strada usa lo stile di default del mapTypeId.
  roadKind?: RoadKind | null
}

// Upsert: se esiste già una riga per la stessa coppia, sovrascrive kind
// e roadKind. Caso d'uso: il master prima rimuove una strada, poi cambia
// idea e la riaggiunge come highway → la riga passa da 'remove' a 'add'
// con roadKind='highway'.
export function upsertAdjacencyOverride(db: Db, input: UpsertAdjacencyOverrideInput): AdjacencyOverrideRow {
  const [areaA, areaB] = normalizePair(input.areaA, input.areaB)
  if (areaA === areaB) throw new Error('areaA === areaB')
  const now = Date.now()
  const existing = db.select().from(areaAdjacencyOverrides)
    .where(and(
      eq(areaAdjacencyOverrides.partySeed, input.partySeed),
      eq(areaAdjacencyOverrides.mapId, input.mapId),
      eq(areaAdjacencyOverrides.areaA, areaA),
      eq(areaAdjacencyOverrides.areaB, areaB)
    )).get() as AdjacencyOverrideRow | undefined
  const roadKind = input.roadKind ?? null
  if (existing) {
    db.update(areaAdjacencyOverrides).set({ kind: input.kind, roadKind })
      .where(and(
        eq(areaAdjacencyOverrides.partySeed, input.partySeed),
        eq(areaAdjacencyOverrides.mapId, input.mapId),
        eq(areaAdjacencyOverrides.areaA, areaA),
        eq(areaAdjacencyOverrides.areaB, areaB)
      )).run()
  } else {
    db.insert(areaAdjacencyOverrides).values({
      partySeed: input.partySeed,
      mapId: input.mapId,
      areaA,
      areaB,
      kind: input.kind,
      roadKind,
      createdAt: now
    }).run()
  }
  return {
    partySeed: input.partySeed,
    mapId: input.mapId,
    areaA,
    areaB,
    kind: input.kind,
    roadKind,
    createdAt: existing?.createdAt ?? now
  }
}

// Applica una lista di override ('add' / 'remove') a un'adjacency base
// e restituisce il grafo effettivo. Il client fa lo stesso lato view —
// usato dal server in handleMoveRequest per validare il movimento in
// modo coerente con quello che il giocatore vede sulla mappa (master
// può aggiungere/togliere strade dall'edit mode).
export function applyAdjacencyOverrides(
  baseAdj: Record<string, readonly string[]>,
  overrides: ReadonlyArray<{ areaA: string, areaB: string, kind: 'add' | 'remove' }>
): Record<string, string[]> {
  const adj: Record<string, Set<string>> = {}
  for (const k of Object.keys(baseAdj)) {
    adj[k] = new Set(baseAdj[k])
  }
  for (const o of overrides) {
    if (!adj[o.areaA]) adj[o.areaA] = new Set()
    if (!adj[o.areaB]) adj[o.areaB] = new Set()
    if (o.kind === 'add') {
      adj[o.areaA]!.add(o.areaB)
      adj[o.areaB]!.add(o.areaA)
    } else {
      adj[o.areaA]!.delete(o.areaB)
      adj[o.areaB]!.delete(o.areaA)
    }
  }
  const out: Record<string, string[]> = {}
  for (const k of Object.keys(adj)) out[k] = Array.from(adj[k]!)
  return out
}

// Cancella un override (restore al comportamento prossimità auto).
export function deleteAdjacencyOverride(db: Db, partySeed: string, mapId: string, areaA: string, areaB: string): void {
  const [a, b] = normalizePair(areaA, areaB)
  db.delete(areaAdjacencyOverrides)
    .where(and(
      eq(areaAdjacencyOverrides.partySeed, partySeed),
      eq(areaAdjacencyOverrides.mapId, mapId),
      eq(areaAdjacencyOverrides.areaA, a),
      eq(areaAdjacencyOverrides.areaB, b)
    )).run()
}
