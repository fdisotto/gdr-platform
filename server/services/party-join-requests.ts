import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { partyJoinRequests } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'
import { DomainError } from '~~/shared/errors'

export type JoinRequestStatus = 'pending' | 'approved' | 'rejected' | 'cancelled'

export interface JoinRequestRow {
  id: string
  partySeed: string
  userId: string
  displayName: string
  message: string | null
  createdAt: number
  status: JoinRequestStatus
  resolvedAt: number | null
  resolvedBy: string | null
  rejectReason: string | null
}

export interface CreateRequestInput {
  partySeed: string
  userId: string
  displayName: string
  message?: string
}

export function createRequest(db: Db, input: CreateRequestInput): JoinRequestRow {
  const id = generateUuid()
  const now = Date.now()
  const row: JoinRequestRow = {
    id,
    partySeed: input.partySeed,
    userId: input.userId,
    displayName: input.displayName,
    message: input.message ?? null,
    createdAt: now,
    status: 'pending',
    resolvedAt: null,
    resolvedBy: null,
    rejectReason: null
  }
  try {
    db.insert(partyJoinRequests).values(row).run()
  } catch (e) {
    // Vincolo unique (party,user,status='pending') → 409 conflict per evitare
    // doppi invii. Riprova consentita solo dopo cancel/reject/approve.
    const msg = (e as Error).message ?? ''
    if (/UNIQUE constraint failed/i.test(msg)) {
      throw new DomainError('conflict', 'pending request already exists')
    }
    throw e
  }
  return row
}

export function listRequests(
  db: Db,
  partySeed: string,
  status: JoinRequestStatus = 'pending'
): JoinRequestRow[] {
  return db.select().from(partyJoinRequests)
    .where(and(
      eq(partyJoinRequests.partySeed, partySeed),
      eq(partyJoinRequests.status, status)
    ))
    .orderBy(desc(partyJoinRequests.createdAt))
    .all() as JoinRequestRow[]
}

export function findRequest(db: Db, id: string): JoinRequestRow | null {
  const rows = db.select().from(partyJoinRequests)
    .where(eq(partyJoinRequests.id, id))
    .all() as JoinRequestRow[]
  return rows[0] ?? null
}

export function approveRequest(db: Db, id: string, resolvedBy: string): void {
  db.update(partyJoinRequests)
    .set({ status: 'approved', resolvedAt: Date.now(), resolvedBy })
    .where(eq(partyJoinRequests.id, id))
    .run()
}

export function rejectRequest(db: Db, id: string, resolvedBy: string, reason?: string): void {
  db.update(partyJoinRequests)
    .set({
      status: 'rejected',
      resolvedAt: Date.now(),
      resolvedBy,
      rejectReason: reason ?? null
    })
    .where(eq(partyJoinRequests.id, id))
    .run()
}

export function cancelRequest(db: Db, id: string, byUserId: string): void {
  // Solo il richiedente può cancellare e solo se ancora pending. Stato
  // diverso o utente diverso → forbidden (è una guardia di autorizzazione,
  // non un not_found, perché la riga esiste).
  const r = findRequest(db, id)
  if (!r) throw new DomainError('not_found', `join request ${id}`)
  if (r.userId !== byUserId) throw new DomainError('forbidden', 'not requester')
  if (r.status !== 'pending') throw new DomainError('forbidden', `not pending (${r.status})`)
  db.update(partyJoinRequests)
    .set({ status: 'cancelled', resolvedAt: Date.now() })
    .where(eq(partyJoinRequests.id, id))
    .run()
}
