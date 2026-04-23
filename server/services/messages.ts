import { and, asc, desc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { messages } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'

export interface MessageRow {
  id: string
  partySeed: string
  kind: string
  authorPlayerId: string | null
  authorDisplay: string
  areaId: string | null
  targetPlayerId: string | null
  body: string
  rollPayload: string | null
  createdAt: number
  deletedAt: number | null
  deletedBy: string | null
  editedAt: number | null
}

export interface InsertMessageInput {
  partySeed: string
  kind: string
  authorPlayerId?: string | null
  authorDisplay: string
  areaId?: string | null
  targetPlayerId?: string | null
  body: string
  rollPayload?: string | null
}

export function insertMessage(db: Db, input: InsertMessageInput): MessageRow {
  const id = generateUuid()
  const now = Date.now()
  const row: MessageRow = {
    id,
    partySeed: input.partySeed,
    kind: input.kind,
    authorPlayerId: input.authorPlayerId ?? null,
    authorDisplay: input.authorDisplay,
    areaId: input.areaId ?? null,
    targetPlayerId: input.targetPlayerId ?? null,
    body: input.body,
    rollPayload: input.rollPayload ?? null,
    createdAt: now,
    deletedAt: null,
    deletedBy: null,
    editedAt: null
  }
  db.insert(messages).values(row).run()
  return row
}

export function listAreaMessages(db: Db, seed: string, areaId: string, limit: number): MessageRow[] {
  const rows = db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.areaId, areaId)))
    .orderBy(desc(messages.createdAt))
    .limit(limit)
    .all() as MessageRow[]
  return rows.reverse()
}

export function listMessagesSince(db: Db, seed: string, areaId: string, sinceMs: number): MessageRow[] {
  const rows = db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.areaId, areaId)))
    .orderBy(asc(messages.createdAt))
    .all() as MessageRow[]
  return rows.filter(m => m.createdAt > sinceMs)
}

export function softDeleteMessage(db: Db, messageId: string, byPlayerId: string): void {
  db.update(messages)
    .set({ deletedAt: Date.now(), deletedBy: byPlayerId })
    .where(eq(messages.id, messageId))
    .run()
}

export function editMessage(db: Db, messageId: string, newBody: string): void {
  db.update(messages)
    .set({ body: newBody, editedAt: Date.now() })
    .where(eq(messages.id, messageId))
    .run()
}

export function findMessage(db: Db, messageId: string): MessageRow | null {
  const rows = db.select().from(messages).where(eq(messages.id, messageId)).all()
  return (rows[0] as MessageRow | undefined) ?? null
}
