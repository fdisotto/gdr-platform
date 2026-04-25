import { and, eq, isNull } from 'drizzle-orm'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { players } from '~~/server/db/schema'
import { DomainError } from '~~/shared/errors'

// v2b: lista members attivi (non left, non kicked) della party.
// Restituisce playerId, nickname, userId, role — necessario alla UI master
// per promote/demote (richiedono targetUserId).
// Visibile solo ai master correnti della party.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'members')
    }
    const rows = db.select({
      playerId: players.id,
      nickname: players.nickname,
      userId: players.userId,
      role: players.role
    }).from(players)
      .where(and(
        eq(players.partySeed, seed),
        eq(players.isKicked, false),
        isNull(players.leftAt)
      ))
      .all()
    return { members: rows }
  } catch (e) {
    toH3Error(e)
  }
})
