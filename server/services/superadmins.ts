import { and, eq, isNull } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { superadmins } from '~~/server/db/schema'
import { hashPassword } from '~~/server/services/auth'
import { revokeAllForSuperadmin } from '~~/server/services/sessions'
import { generateUuid } from '~~/server/utils/crypto'

export interface SuperadminRow {
  id: string
  username: string
  usernameLower: string
  passwordHash: string
  mustReset: boolean
  createdAt: number
  revokedAt: number | null
  revokedBy: string | null
}

export interface InsertSuperadminInput {
  id: string
  username: string
  passwordHash: string
  mustReset?: boolean
}

export function insertSuperadmin(db: Db, params: InsertSuperadminInput): SuperadminRow {
  const row: SuperadminRow = {
    id: params.id,
    username: params.username,
    usernameLower: params.username.toLowerCase(),
    passwordHash: params.passwordHash,
    mustReset: params.mustReset ?? false,
    createdAt: Date.now(),
    revokedAt: null,
    revokedBy: null
  }
  db.insert(superadmins).values(row).run()
  return row
}

// Le find* "raw" NON filtrano revokedAt: utili a list/audit amministrativi.
// Per i path di autenticazione usare findActiveSuperadmin*.
export function findSuperadminByUsername(db: Db, username: string): SuperadminRow | null {
  const r = db.select().from(superadmins)
    .where(eq(superadmins.usernameLower, username.toLowerCase()))
    .get() as SuperadminRow | undefined
  return r ?? null
}

export function findSuperadminById(db: Db, id: string): SuperadminRow | null {
  const r = db.select().from(superadmins).where(eq(superadmins.id, id)).get() as SuperadminRow | undefined
  return r ?? null
}

export function listSuperadmins(db: Db): SuperadminRow[] {
  return db.select().from(superadmins).all() as SuperadminRow[]
}

// v2c: lookup attivi (revokedAt IS NULL) per i path di auth/middleware.
export function findActiveSuperadminByUsername(db: Db, username: string): SuperadminRow | null {
  const r = db.select().from(superadmins)
    .where(and(
      eq(superadmins.usernameLower, username.toLowerCase()),
      isNull(superadmins.revokedAt)
    ))
    .get() as SuperadminRow | undefined
  return r ?? null
}

export function findActiveSuperadminById(db: Db, id: string): SuperadminRow | null {
  const r = db.select().from(superadmins)
    .where(and(eq(superadmins.id, id), isNull(superadmins.revokedAt)))
    .get() as SuperadminRow | undefined
  return r ?? null
}

export function listActiveSuperadmins(db: Db): SuperadminRow[] {
  return db.select().from(superadmins)
    .where(isNull(superadmins.revokedAt))
    .all() as SuperadminRow[]
}

export function countActiveSuperadmins(db: Db): number {
  return listActiveSuperadmins(db).length
}

// v2c: revoke soft-delete + revoca tutte le session attive del superadmin.
// Idempotente: se già revocato non sovrascrive il timestamp originale.
export function revokeSuperadmin(db: Db, id: string, byUserId: string): void {
  const sa = findSuperadminById(db, id)
  if (!sa) return
  if (sa.revokedAt != null) return
  db.update(superadmins)
    .set({ revokedAt: Date.now(), revokedBy: byUserId })
    .where(eq(superadmins.id, id))
    .run()
  revokeAllForSuperadmin(db, id)
}

export function updatePassword(db: Db, id: string, newHash: string): void {
  db.update(superadmins).set({ passwordHash: newHash, mustReset: false }).where(eq(superadmins.id, id)).run()
}

export function markMustReset(db: Db, id: string, value: boolean): void {
  db.update(superadmins).set({ mustReset: value }).where(eq(superadmins.id, id)).run()
}

// Idempotente: se esiste già almeno un superadmin, no-op. Altrimenti inserisce
// admin/changeme con mustReset=true (al primo login va forzato il cambio).
export async function seedDefaultSuperadmin(db: Db): Promise<boolean> {
  const existing = listSuperadmins(db)
  if (existing.length > 0) return false
  const passwordHash = await hashPassword('changeme')
  insertSuperadmin(db, {
    id: generateUuid(),
    username: 'admin',
    passwordHash,
    mustReset: true
  })
  return true
}
