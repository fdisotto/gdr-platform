import { desc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { masterActions } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'

export interface MasterActionInput {
  partySeed: string
  masterId: string
  action: string
  target?: string | null
  payload?: Record<string, unknown>
}

export function logMasterAction(db: Db, input: MasterActionInput) {
  db.insert(masterActions).values({
    id: generateUuid(),
    partySeed: input.partySeed,
    masterId: input.masterId,
    action: input.action,
    target: input.target ?? null,
    payload: input.payload ? JSON.stringify(input.payload) : null,
    createdAt: Date.now()
  }).run()
}

export function listMasterActions(db: Db, seed: string, limit = 100) {
  return db.select().from(masterActions)
    .where(eq(masterActions.partySeed, seed))
    .orderBy(desc(masterActions.createdAt))
    .limit(limit)
    .all()
}
