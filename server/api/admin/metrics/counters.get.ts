import { count, isNotNull, gte, lt, and } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import {
  users, parties, messages, zombies, sessions
} from '~~/server/db/schema'
import { registry } from '~~/server/ws/state'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const db = useDb()
    const now = Date.now()
    const ago24h = now - 86400_000

    const usersByStatus = db.select({ status: users.status }).from(users).all() as { status: string }[]
    const usersTotal = usersByStatus.length
    const usersPending = usersByStatus.filter(u => u.status === 'pending').length
    const usersApproved = usersByStatus.filter(u => u.status === 'approved').length
    const usersBanned = usersByStatus.filter(u => u.status === 'banned').length

    const partyRows = db.select({
      visibility: parties.visibility,
      joinPolicy: parties.joinPolicy,
      archivedAt: parties.archivedAt
    }).from(parties).all() as Array<{ visibility: string, joinPolicy: string, archivedAt: number | null }>
    const partiesTotal = partyRows.length
    const partiesActive = partyRows.filter(p => p.archivedAt == null).length
    const partiesArchived = partyRows.filter(p => p.archivedAt != null).length
    const byVisibility = {
      public: partyRows.filter(p => p.visibility === 'public').length,
      private: partyRows.filter(p => p.visibility === 'private').length
    }
    const byPolicy = {
      auto: partyRows.filter(p => p.joinPolicy === 'auto').length,
      request: partyRows.filter(p => p.joinPolicy === 'request').length
    }

    const messagesTotalRow = db.select({ c: count() }).from(messages).all() as { c: number }[]
    const messagesLast24Row = db.select({ c: count() }).from(messages)
      .where(gte(messages.createdAt, ago24h)).all() as { c: number }[]
    const zombiesTotalRow = db.select({ c: count() }).from(zombies).all() as { c: number }[]
    const npcsRow = db.select({ c: count() }).from(zombies)
      .where(isNotNull(zombies.npcName)).all() as { c: number }[]

    const sessionsActiveRow = db.select({ c: count() }).from(sessions)
      .where(gte(sessions.expiresAt, now)).all() as { c: number }[]
    // expired_last24h: il sessions service cancella le sessioni scadute, quindi
    // il count è approssimato dal subset ancora presente con expiresAt nel
    // passato (non ancora pulito) — utile come segnale, non source of truth.
    const sessionsExpiredRow = db.select({ c: count() }).from(sessions)
      .where(and(lt(sessions.expiresAt, now), gte(sessions.expiresAt, ago24h))).all() as { c: number }[]

    return {
      users: {
        total: usersTotal,
        pending: usersPending,
        approved: usersApproved,
        banned: usersBanned
      },
      parties: {
        total: partiesTotal,
        active: partiesActive,
        archived: partiesArchived,
        byVisibility,
        byPolicy
      },
      messages: {
        total: messagesTotalRow[0]?.c ?? 0,
        last24h: messagesLast24Row[0]?.c ?? 0
      },
      zombies: {
        total: zombiesTotalRow[0]?.c ?? 0,
        npcs: npcsRow[0]?.c ?? 0
      },
      sessions: {
        active: sessionsActiveRow[0]?.c ?? 0,
        expiredLast24h: sessionsExpiredRow[0]?.c ?? 0
      },
      wsConnections: {
        current: registry.all().length
      },
      serverTime: now
    }
  } catch (e) {
    toH3Error(e)
  }
})
