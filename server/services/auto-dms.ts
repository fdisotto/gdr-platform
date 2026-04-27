import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { autoDms } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/random'

export interface AutoDmRow {
  id: string
  partySeed: string
  subject: string
  body: string
  enabled: boolean
  triggerKind: 'on_join'
  createdAt: number
  updatedAt: number
}

interface RawRow extends Omit<AutoDmRow, 'enabled'> {
  enabled: boolean | 0 | 1
}

function mapRow(r: RawRow): AutoDmRow {
  return { ...r, enabled: Boolean(r.enabled) }
}

export function listAutoDms(db: Db, partySeed: string): AutoDmRow[] {
  const rows = db.select().from(autoDms)
    .where(eq(autoDms.partySeed, partySeed))
    .orderBy(desc(autoDms.createdAt))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function listEnabledAutoDmsForTrigger(db: Db, partySeed: string, trigger: 'on_join'): AutoDmRow[] {
  const rows = db.select().from(autoDms)
    .where(and(
      eq(autoDms.partySeed, partySeed),
      eq(autoDms.triggerKind, trigger),
      eq(autoDms.enabled, true)
    ))
    .all() as RawRow[]
  return rows.map(mapRow)
}

export function findAutoDm(db: Db, id: string): AutoDmRow | null {
  const rows = db.select().from(autoDms).where(eq(autoDms.id, id)).all() as RawRow[]
  return rows[0] ? mapRow(rows[0]) : null
}

export interface CreateAutoDmInput {
  partySeed: string
  subject: string
  body: string
  enabled?: boolean
}

export function createAutoDm(db: Db, input: CreateAutoDmInput): AutoDmRow {
  const id = generateUuid()
  const now = Date.now()
  const row: AutoDmRow = {
    id,
    partySeed: input.partySeed,
    subject: input.subject.trim().slice(0, 64),
    body: input.body.trim().slice(0, 2000),
    enabled: input.enabled !== false,
    triggerKind: 'on_join',
    createdAt: now,
    updatedAt: now
  }
  db.insert(autoDms).values(row).run()
  return row
}

export interface UpdateAutoDmInput {
  subject?: string
  body?: string
  enabled?: boolean
}

export function updateAutoDm(db: Db, id: string, input: UpdateAutoDmInput): AutoDmRow | null {
  const existing = findAutoDm(db, id)
  if (!existing) return null
  const next: Partial<AutoDmRow> = { updatedAt: Date.now() }
  if (input.subject !== undefined) next.subject = input.subject.trim().slice(0, 64)
  if (input.body !== undefined) next.body = input.body.trim().slice(0, 2000)
  if (input.enabled !== undefined) next.enabled = input.enabled
  db.update(autoDms).set(next).where(eq(autoDms.id, id)).run()
  return findAutoDm(db, id)
}

export function deleteAutoDm(db: Db, id: string): void {
  db.delete(autoDms).where(eq(autoDms.id, id)).run()
}
