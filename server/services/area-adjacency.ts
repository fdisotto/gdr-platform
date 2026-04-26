import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areaAdjacencyOverrides } from '~~/server/db/schema'

// v2d-edit: override grafo adjacency. Il client calcola le adiacenze base
// dalla prossimità spaziale; questi override aggiungono strade tra aree
// non vicine (kind='add') o rimuovono strade generate automaticamente
// (kind='remove'). La coppia (areaA, areaB) è sempre normalizzata in
// ordine lessicografico, così non esistono righe duplicate per la stessa
// strada simmetrica.

export interface AdjacencyOverrideRow {
  partySeed: string
  mapId: string
  areaA: string
  areaB: string
  kind: 'add' | 'remove'
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
}

// Upsert: se esiste già una riga per la stessa coppia, sovrascrive il
// kind. Caso d'uso: il master prima rimuove una strada, poi cambia idea
// e la riaggiunge → la riga passa da 'remove' a 'add'.
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
  if (existing) {
    db.update(areaAdjacencyOverrides).set({ kind: input.kind })
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
      createdAt: now
    }).run()
  }
  return {
    partySeed: input.partySeed,
    mapId: input.mapId,
    areaA,
    areaB,
    kind: input.kind,
    createdAt: existing?.createdAt ?? now
  }
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
