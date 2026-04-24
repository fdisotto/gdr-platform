import { and, desc, eq } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { authEvents } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'

export type AuthEventKind
  = | 'register'
    | 'register_approved'
    | 'register_rejected'
    | 'login'
    | 'login_failed'
    | 'logout'
    | 'password_changed_self'
    | 'password_reset_by_admin'
    | 'banned'
    | 'session_expired'

export type ActorKind = 'user' | 'superadmin' | 'anonymous'

export interface AuthEventRow {
  id: string
  actorKind: ActorKind
  actorId: string | null
  usernameAttempted: string | null
  event: string
  ip: string | null
  userAgent: string | null
  detail: string | null
  createdAt: number
}

export interface LogAuthEventInput {
  actorKind: ActorKind
  actorId?: string
  usernameAttempted?: string
  event: AuthEventKind
  ip?: string
  userAgent?: string
  detail?: string
}

export function logAuthEvent(db: Db, params: LogAuthEventInput): void {
  const row: AuthEventRow = {
    id: generateUuid(),
    actorKind: params.actorKind,
    actorId: params.actorId ?? null,
    usernameAttempted: params.usernameAttempted ?? null,
    event: params.event,
    ip: params.ip ?? null,
    userAgent: params.userAgent ?? null,
    detail: params.detail ?? null,
    createdAt: Date.now()
  }
  db.insert(authEvents).values(row).run()
}

export function listAuthEvents(db: Db, limit = 100): AuthEventRow[] {
  return db.select().from(authEvents)
    .orderBy(desc(authEvents.createdAt))
    .limit(limit)
    .all() as AuthEventRow[]
}

export function listAuthEventsByActor(
  db: Db,
  actorKind: ActorKind,
  actorId: string,
  limit = 100
): AuthEventRow[] {
  return db.select().from(authEvents)
    .where(and(eq(authEvents.actorKind, actorKind), eq(authEvents.actorId, actorId)))
    .orderBy(desc(authEvents.createdAt))
    .limit(limit)
    .all() as AuthEventRow[]
}
