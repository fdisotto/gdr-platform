import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { areasState } from '~~/server/db/schema'

export interface AreaStateRow {
  partySeed: string
  areaId: string
  status: 'intact' | 'infested' | 'ruined' | 'closed'
  customName: string | null
  notes: string | null
}

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

export function updateAreaState(db: Db, seed: string, areaId: string, patch: AreaStatePatch): void {
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
