import { eq } from 'drizzle-orm'
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
