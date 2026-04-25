import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areasState } from '~~/server/db/schema'

export interface AreaStateRow {
  partySeed: string
  mapId: string | null
  areaId: string
  status: 'intact' | 'infested' | 'ruined' | 'closed'
  customName: string | null
  notes: string | null
}

// v2d: mapId è opzionale per retrocompat. Quando T16 popola mapId
// (createParty/joinParty) la PK resta (partySeed, areaId) — la migration
// 0006 estenderà a (partySeed, mapId, areaId). Le query non filtrano per
// mapId per evitare rumore con righe legacy.
export function listAreasState(db: Db, seed: string): AreaStateRow[] {
  return db.select().from(areasState)
    .where(eq(areasState.partySeed, seed))
    .all() as AreaStateRow[]
}

export interface AreaStatePatch {
  status?: 'intact' | 'infested' | 'ruined' | 'closed'
  customName?: string | null
  notes?: string | null
}

// v2d: upsert idempotente. Se la riga esiste, applica patch; altrimenti
// inserisce con status='intact' default + mapId. Il caller passa mapId
// quando vuole annotare a quale mappa appartiene la riga.
export function updateAreaState(
  db: Db, seed: string, areaId: string, patch: AreaStatePatch, mapId?: string
): void {
  const existing = findAreaState(db, seed, areaId)
  if (!existing) {
    db.insert(areasState).values({
      partySeed: seed,
      mapId: mapId ?? null,
      areaId,
      status: patch.status ?? 'intact',
      customName: patch.customName ?? null,
      notes: patch.notes ?? null
    }).run()
    return
  }
  const updates: Record<string, unknown> = {}
  if (patch.status !== undefined) updates.status = patch.status
  if (patch.customName !== undefined) updates.customName = patch.customName
  if (patch.notes !== undefined) updates.notes = patch.notes
  if (Object.keys(updates).length === 0) return
  db.update(areasState)
    .set(updates)
    .where(and(eq(areasState.partySeed, seed), eq(areasState.areaId, areaId)))
    .run()
}

export function findAreaState(db: Db, seed: string, areaId: string): AreaStateRow | null {
  const rows = db.select().from(areasState)
    .where(and(eq(areasState.partySeed, seed), eq(areasState.areaId, areaId)))
    .all() as AreaStateRow[]
  return rows[0] ?? null
}
