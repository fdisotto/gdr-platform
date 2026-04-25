import { randomBytes } from 'node:crypto'
import { and, eq, gt, isNull } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { partyInvites } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'
import { INVITE_TTL_DAYS } from '~~/shared/limits'

export interface InviteRow {
  id: string
  partySeed: string
  token: string
  createdBy: string
  createdAt: number
  expiresAt: number
  usedAt: number | null
  usedBy: string | null
  revokedAt: number | null
}

export interface CreateInviteInput {
  partySeed: string
  createdBy: string
}

export function createInvite(db: Db, input: CreateInviteInput): InviteRow {
  const id = generateUuid()
  // base64url 32 byte → ~43 char URL-safe, niente padding.
  const token = randomBytes(32).toString('base64url')
  const now = Date.now()
  const expiresAt = now + INVITE_TTL_DAYS * 86400_000
  const row: InviteRow = {
    id,
    partySeed: input.partySeed,
    token,
    createdBy: input.createdBy,
    createdAt: now,
    expiresAt,
    usedAt: null,
    usedBy: null,
    revokedAt: null
  }
  db.insert(partyInvites).values(row).run()
  return row
}

export function listInvites(db: Db, partySeed: string): InviteRow[] {
  return db.select().from(partyInvites)
    .where(eq(partyInvites.partySeed, partySeed))
    .all() as InviteRow[]
}

export function findActiveByToken(db: Db, token: string, now: number = Date.now()): InviteRow | null {
  const rows = db.select().from(partyInvites)
    .where(and(
      eq(partyInvites.token, token),
      isNull(partyInvites.usedAt),
      isNull(partyInvites.revokedAt),
      gt(partyInvites.expiresAt, now)
    ))
    .all() as InviteRow[]
  return rows[0] ?? null
}

export function consumeInvite(db: Db, id: string, byUserId: string): void {
  db.update(partyInvites)
    .set({ usedAt: Date.now(), usedBy: byUserId })
    .where(eq(partyInvites.id, id))
    .run()
}

export function revokeInvite(db: Db, id: string): void {
  db.update(partyInvites)
    .set({ revokedAt: Date.now() })
    .where(eq(partyInvites.id, id))
    .run()
}
