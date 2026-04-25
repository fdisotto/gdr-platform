import { and, desc, eq, lt } from 'drizzle-orm'
import type { Db } from '~~/server/db/client'
import { adminActions } from '~~/server/db/schema'
import { generateUuid } from '~~/server/utils/crypto'

// Enum aperto: dichiariamo i kind noti per type-check al call site, ma il
// servizio accetta string in DB per evitare migration ad ogni nuova azione.
export type AdminActionKind
  = | 'party.edit'
    | 'party.archive'
    | 'party.restore'
    | 'party.delete'
    | 'party.transfer_master'
    | 'user.ban'
    | 'user.unban'
    | 'user.reset_password'
    | 'user.approve_registration'
    | 'user.reject_registration'
    | 'admin.elevate'
    | 'admin.revoke'
    | 'setting.update'
    | 'maintenance.enable'
    | 'maintenance.disable'
    // v2d multi-map
    | 'map_type.update'

export type AdminActionTargetKind = 'user' | 'party' | 'admin' | 'setting' | 'map_type' | null

export interface AdminActionRow {
  id: string
  superadminId: string
  action: string
  targetKind: AdminActionTargetKind
  targetId: string | null
  payload: unknown
  createdAt: number
}

export interface LogAdminActionInput {
  superadminId: string
  action: AdminActionKind | string
  targetKind?: AdminActionTargetKind
  targetId?: string | null
  payload?: unknown
}

export function logAdminAction(db: Db, params: LogAdminActionInput): void {
  db.insert(adminActions).values({
    id: generateUuid(),
    superadminId: params.superadminId,
    action: params.action,
    targetKind: params.targetKind ?? null,
    targetId: params.targetId ?? null,
    payload: params.payload != null ? JSON.stringify(params.payload) : null,
    createdAt: Date.now()
  }).run()
}

interface ListOpts {
  limit?: number
  // cursor stile "less than this createdAt" per paginazione desc
  before?: number
}

function rowFromDb(r: {
  id: string
  superadminId: string
  action: string
  targetKind: string | null
  targetId: string | null
  payload: string | null
  createdAt: number
}): AdminActionRow {
  let payload: unknown = null
  if (r.payload != null) {
    try {
      payload = JSON.parse(r.payload)
    } catch {
      payload = r.payload
    }
  }
  return {
    id: r.id,
    superadminId: r.superadminId,
    action: r.action,
    targetKind: r.targetKind as AdminActionTargetKind,
    targetId: r.targetId,
    payload,
    createdAt: r.createdAt
  }
}

export function listAdminActions(db: Db, opts: ListOpts): AdminActionRow[] {
  const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500)
  const where = opts.before != null ? lt(adminActions.createdAt, opts.before) : undefined
  const q = db.select().from(adminActions)
  const rows = (where ? q.where(where) : q)
    .orderBy(desc(adminActions.createdAt))
    .limit(limit)
    .all() as Array<Parameters<typeof rowFromDb>[0]>
  return rows.map(rowFromDb)
}

export function listAdminActionsByActor(
  db: Db, superadminId: string, limit = 100
): AdminActionRow[] {
  const capped = Math.min(Math.max(limit, 1), 500)
  const rows = db.select().from(adminActions)
    .where(and(eq(adminActions.superadminId, superadminId)))
    .orderBy(desc(adminActions.createdAt))
    .limit(capped)
    .all() as Array<Parameters<typeof rowFromDb>[0]>
  return rows.map(rowFromDb)
}
