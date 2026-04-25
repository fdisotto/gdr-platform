import { createError, getRouterParam } from 'h3'
import { and, eq, isNull, count } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import {
  parties, players, messages, zombies, partyInvites, users
} from '~~/server/db/schema'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const seed = getRouterParam(event, 'seed')
    if (!seed) throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    const db = useDb()
    const party = db.select().from(parties).where(eq(parties.seed, seed)).get() as {
      seed: string
      cityName: string
      visibility: string
      joinPolicy: string
      archivedAt: number | null
      createdAt: number
      lastActivityAt: number
    } | undefined
    if (!party) throw createError({ statusCode: 404, statusMessage: 'not_found' })

    // Membri attivi con username
    const memberRows = db.select({
      id: players.id,
      userId: players.userId,
      nickname: players.nickname,
      role: players.role,
      joinedAt: players.joinedAt,
      lastSeenAt: players.lastSeenAt,
      isMuted: players.isMuted,
      leftAt: players.leftAt,
      username: users.username
    }).from(players)
      .leftJoin(users, eq(players.userId, users.id))
      .where(and(
        eq(players.partySeed, seed),
        isNull(players.leftAt),
        eq(players.isKicked, false)
      ))
      .all()

    const msgCountRow = db.select({ c: count() }).from(messages)
      .where(eq(messages.partySeed, seed))
      .all() as { c: number }[]
    const zombieCountRow = db.select({ c: count() }).from(zombies)
      .where(eq(zombies.partySeed, seed))
      .all() as { c: number }[]
    const inviteCountRow = db.select({ c: count() }).from(partyInvites)
      .where(and(
        eq(partyInvites.partySeed, seed),
        isNull(partyInvites.usedAt),
        isNull(partyInvites.revokedAt)
      ))
      .all() as { c: number }[]

    return {
      seed: party.seed,
      cityName: party.cityName,
      visibility: party.visibility,
      joinPolicy: party.joinPolicy,
      archivedAt: party.archivedAt,
      createdAt: party.createdAt,
      lastActivityAt: party.lastActivityAt,
      members: memberRows,
      counts: {
        messages: msgCountRow[0]?.c ?? 0,
        zombies: zombieCountRow[0]?.c ?? 0,
        activeInvites: inviteCountRow[0]?.c ?? 0
      }
    }
  } catch (e) {
    toH3Error(e)
  }
})
