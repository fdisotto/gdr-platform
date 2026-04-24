import { and, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { users } from '~~/server/db/schema'

export type UserStatus = 'pending' | 'approved' | 'banned'

export interface UserRow {
  id: string
  username: string
  usernameLower: string
  passwordHash: string
  mustReset: boolean
  status: UserStatus
  createdAt: number
  approvedAt: number | null
  approvedBy: string | null
  bannedReason: string | null
}

export interface InsertUserInput {
  id: string
  username: string
  passwordHash: string
}

export function insertUser(db: Db, params: InsertUserInput): UserRow {
  const now = Date.now()
  const row: UserRow = {
    id: params.id,
    username: params.username,
    usernameLower: params.username.toLowerCase(),
    passwordHash: params.passwordHash,
    mustReset: false,
    status: 'pending',
    createdAt: now,
    approvedAt: null,
    approvedBy: null,
    bannedReason: null
  }
  db.insert(users).values(row).run()
  return row
}

export function findUserByUsername(db: Db, username: string): UserRow | null {
  const r = db.select().from(users)
    .where(eq(users.usernameLower, username.toLowerCase()))
    .get() as UserRow | undefined
  return r ?? null
}

export function findUserById(db: Db, id: string): UserRow | null {
  const r = db.select().from(users).where(eq(users.id, id)).get() as UserRow | undefined
  return r ?? null
}

export function listUsersByStatus(db: Db, status: UserStatus): UserRow[] {
  return db.select().from(users).where(eq(users.status, status)).all() as UserRow[]
}

export function approveUser(db: Db, id: string, approvedBy: string): void {
  db.update(users)
    .set({ status: 'approved', approvedAt: Date.now(), approvedBy })
    .where(eq(users.id, id))
    .run()
}

export function banUser(db: Db, id: string, reason: string | null): void {
  db.update(users)
    .set({ status: 'banned', bannedReason: reason })
    .where(eq(users.id, id))
    .run()
}

// Rimuove la riga users ma SOLO se è in stato pending. Gli approved non si
// cancellano (andrebbero in cascade sui players); per quelli si usa banUser.
export function rejectUser(db: Db, id: string): void {
  db.delete(users)
    .where(and(eq(users.id, id), eq(users.status, 'pending')))
    .run()
}

export function markMustReset(db: Db, id: string, value: boolean): void {
  db.update(users).set({ mustReset: value }).where(eq(users.id, id)).run()
}

export function updatePassword(db: Db, id: string, newHash: string): void {
  db.update(users).set({ passwordHash: newHash, mustReset: false }).where(eq(users.id, id)).run()
}
