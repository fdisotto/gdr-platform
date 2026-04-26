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
  mapId: string | null
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
  // v2d: mapId è valorizzato solo per messaggi area-bound (say/shout/zone),
  // null per dm/announce. Optional in input perché molti caller legacy non
  // lo passano ancora; la colonna è nullable nel DB.
  mapId?: string | null
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
    mapId: input.mapId ?? null,
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

// Hard delete: rimuove la riga dal DB. Usato per la "purge" master quando
// soft-delete (placeholder "[messaggio rimosso]") non basta. Niente recovery.
export function hardDeleteMessage(db: Db, messageId: string): void {
  db.delete(messages).where(eq(messages.id, messageId)).run()
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

export function listAreaMessagesBefore(db: Db, seed: string, areaId: string, beforeMs: number, limit: number): MessageRow[] {
  const rows = db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.areaId, areaId)))
    .all() as MessageRow[]
  return rows
    .filter(m => m.createdAt < beforeMs)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .reverse()
}

export function listRecentDmsForPlayer(db: Db, seed: string, playerId: string, limit: number): MessageRow[] {
  const rows = db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.kind, 'dm')))
    .all() as MessageRow[]
  return rows
    .filter(m => m.authorPlayerId === playerId || m.targetPlayerId === playerId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-limit)
}

export function listThreadMessagesBefore(db: Db, seed: string, playerIdA: string, playerIdB: string, beforeMs: number, limit: number): MessageRow[] {
  const rows = db.select().from(messages)
    .where(and(eq(messages.partySeed, seed), eq(messages.kind, 'dm')))
    .all() as MessageRow[]
  return rows
    .filter((m) => {
      if (m.createdAt >= beforeMs) return false
      const a = m.authorPlayerId
      const b = m.targetPlayerId
      if (!a || !b) return false
      return (
        (a === playerIdA && b === playerIdB)
        || (a === playerIdB && b === playerIdA)
      )
    })
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit)
    .reverse()
}
