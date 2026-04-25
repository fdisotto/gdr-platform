import { getQuery, setHeader, setResponseStatus } from 'h3'
import { z } from 'zod'
import { desc, lt } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import {
  users, parties, messages, authEvents, adminActions, players
} from '~~/server/db/schema'
import { toH3Error } from '~~/server/utils/http'

const Query = z.object({
  kind: z.enum(['users', 'parties', 'audit', 'messages']),
  cursor: z.coerce.number().int().nonnegative().optional(),
  limit: z.coerce.number().int().min(1).max(50000).default(5000)
})

function csvEscape(s: unknown): string {
  if (s == null) return ''
  const str = typeof s === 'string' ? s : String(s)
  if (/[",\n\r]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`
  }
  return str
}

function row(...cells: unknown[]): string {
  return cells.map(csvEscape).join(',')
}

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const parsed = Query.safeParse(getQuery(event))
    if (!parsed.success) {
      const { createError } = await import('h3')
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const { kind, cursor, limit } = parsed.data
    const db = useDb()

    setHeader(event, 'content-type', 'text/csv; charset=utf-8')
    setHeader(event, 'content-disposition', `attachment; filename=gdr-${kind}-${Date.now()}.csv`)
    setResponseStatus(event, 200)

    const lines: string[] = []

    if (kind === 'users') {
      lines.push(row('id', 'username', 'status', 'createdAt', 'approvedAt', 'bannedReason'))
      const baseQ = db.select().from(users)
      const rows = (cursor != null
        ? baseQ.where(lt(users.createdAt, cursor)).orderBy(desc(users.createdAt)).limit(limit)
        : baseQ.orderBy(desc(users.createdAt)).limit(limit))
        .all() as Array<{
        id: string
        username: string
        status: string
        createdAt: number
        approvedAt: number | null
        bannedReason: string | null
      }>
      for (const r of rows) {
        lines.push(row(r.id, r.username, r.status, r.createdAt, r.approvedAt ?? '', r.bannedReason ?? ''))
      }
    } else if (kind === 'parties') {
      lines.push(row('seed', 'cityName', 'visibility', 'joinPolicy', 'createdAt', 'archivedAt', 'memberCount', 'lastActivityAt'))
      const baseQ = db.select().from(parties)
      const rows = (cursor != null
        ? baseQ.where(lt(parties.createdAt, cursor)).orderBy(desc(parties.createdAt)).limit(limit)
        : baseQ.orderBy(desc(parties.createdAt)).limit(limit))
        .all() as Array<{
        seed: string
        cityName: string
        visibility: string
        joinPolicy: string
        createdAt: number
        archivedAt: number | null
        lastActivityAt: number
      }>
      for (const r of rows) {
        const memberCountRow = db.select().from(players).all() as Array<{ partySeed: string, leftAt: number | null, isKicked: boolean }>
        const mc = memberCountRow.filter(p => p.partySeed === r.seed && p.leftAt == null && !p.isKicked).length
        lines.push(row(r.seed, r.cityName, r.visibility, r.joinPolicy, r.createdAt, r.archivedAt ?? '', mc, r.lastActivityAt))
      }
    } else if (kind === 'audit') {
      lines.push(row('source', 'createdAt', 'actor', 'action', 'targetKind', 'targetId', 'detail'))
      // Carico le ultime N righe da entrambe e merge ordinato desc
      const aaRows = db.select().from(adminActions)
        .orderBy(desc(adminActions.createdAt))
        .limit(limit)
        .all() as Array<{
        createdAt: number
        superadminId: string
        action: string
        targetKind: string | null
        targetId: string | null
        payload: string | null
      }>
      const aeRows = db.select().from(authEvents)
        .orderBy(desc(authEvents.createdAt))
        .limit(limit)
        .all() as Array<{
        createdAt: number
        actorKind: string
        actorId: string | null
        event: string
        detail: string | null
        usernameAttempted: string | null
      }>
      const merged: Array<{ source: string, createdAt: number, actor: string, action: string, targetKind: string, targetId: string, detail: string }> = []
      for (const a of aaRows) {
        merged.push({
          source: 'admin',
          createdAt: a.createdAt,
          actor: a.superadminId,
          action: a.action,
          targetKind: a.targetKind ?? '',
          targetId: a.targetId ?? '',
          detail: a.payload ?? ''
        })
      }
      for (const a of aeRows) {
        merged.push({
          source: 'auth',
          createdAt: a.createdAt,
          actor: a.actorId ?? a.actorKind,
          action: a.event,
          targetKind: '',
          targetId: a.usernameAttempted ?? '',
          detail: a.detail ?? ''
        })
      }
      merged.sort((a, b) => b.createdAt - a.createdAt)
      const slice = cursor != null ? merged.filter(m => m.createdAt < cursor) : merged
      for (const m of slice.slice(0, limit)) {
        lines.push(row(m.source, m.createdAt, m.actor, m.action, m.targetKind, m.targetId, m.detail))
      }
    } else if (kind === 'messages') {
      lines.push(row('id', 'partySeed', 'kind', 'authorDisplay', 'areaId', 'body', 'createdAt'))
      const baseQ = db.select().from(messages)
      const rows = (cursor != null
        ? baseQ.where(lt(messages.createdAt, cursor)).orderBy(desc(messages.createdAt)).limit(limit)
        : baseQ.orderBy(desc(messages.createdAt)).limit(limit))
        .all() as Array<{
        id: string
        partySeed: string
        kind: string
        authorDisplay: string
        areaId: string | null
        body: string
        createdAt: number
      }>
      for (const r of rows) {
        lines.push(row(r.id, r.partySeed, r.kind, r.authorDisplay, r.areaId ?? '', r.body, r.createdAt))
      }
    }

    return lines.join('\n') + '\n'
  } catch (e) {
    toH3Error(e)
  }
})
