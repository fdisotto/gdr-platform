import { eq, lt } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { sessions } from '~~/server/db/schema'

// 30 giorni: durata massima della sessione cookie.
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
// Se il residuo scende sotto questa soglia, la extend prolunga a TTL pieno
// (sliding expiration). 15 giorni = metà TTL.
export const SESSION_EXTEND_THRESHOLD_MS = 15 * 24 * 60 * 60 * 1000

export interface SessionRow {
  token: string
  userId: string | null
  superadminId: string | null
  createdAt: number
  lastActivityAt: number
  expiresAt: number
  ip: string | null
  userAgent: string | null
}

export interface CreateSessionInput {
  token: string
  userId?: string
  superadminId?: string
  ip?: string
  userAgent?: string
  now?: number
}

export function createSession(db: Db, params: CreateSessionInput): SessionRow {
  const hasUser = params.userId != null
  const hasSa = params.superadminId != null
  if (hasUser === hasSa) {
    throw new Error('createSession: esattamente uno tra userId e superadminId è richiesto')
  }
  const now = params.now ?? Date.now()
  const row: SessionRow = {
    token: params.token,
    userId: params.userId ?? null,
    superadminId: params.superadminId ?? null,
    createdAt: now,
    lastActivityAt: now,
    expiresAt: now + SESSION_TTL_MS,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null
  }
  db.insert(sessions).values(row).run()
  return row
}

export function findSession(db: Db, token: string, now: number = Date.now()): SessionRow | null {
  const r = db.select().from(sessions).where(eq(sessions.token, token)).get() as SessionRow | undefined
  if (!r) return null
  if (r.expiresAt <= now) return null
  return r
}

// Aggiorna lastActivityAt sempre. Prolunga expiresAt solo se il residuo
// è già sotto la soglia (evitiamo update frequenti e noisy per sessioni
// ancora "giovani").
export function extendSession(db: Db, token: string, now: number = Date.now()): void {
  const r = db.select().from(sessions).where(eq(sessions.token, token)).get() as SessionRow | undefined
  if (!r) return
  const remaining = r.expiresAt - now
  if (remaining < SESSION_EXTEND_THRESHOLD_MS) {
    db.update(sessions)
      .set({ lastActivityAt: now, expiresAt: now + SESSION_TTL_MS })
      .where(eq(sessions.token, token))
      .run()
  } else {
    db.update(sessions)
      .set({ lastActivityAt: now })
      .where(eq(sessions.token, token))
      .run()
  }
}

export function revokeSession(db: Db, token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run()
}

export function revokeAllForUser(db: Db, userId: string): void {
  db.delete(sessions).where(eq(sessions.userId, userId)).run()
}

export function revokeAllForSuperadmin(db: Db, superadminId: string): void {
  db.delete(sessions).where(eq(sessions.superadminId, superadminId)).run()
}

// Ritorna il numero di righe cancellate. Chiamato al boot dal plugin Nitro.
export function cleanupExpiredSessions(db: Db, now: number = Date.now()): number {
  // better-sqlite3 ritorna info.changes via .run(); drizzle espone run() con
  // il risultato. Usiamo una query esplicita per avere il conteggio.
  const result = db.delete(sessions).where(lt(sessions.expiresAt, now)).run()
  // better-sqlite3 RunResult ha `changes`.
  const changes = (result as unknown as { changes: number }).changes
  return changes ?? 0
}
