import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import {
  archiveParty, isMaster, partyMustExist
} from '~~/server/services/parties'
import { findPlayerByUserInParty } from '~~/server/services/players'
import { logMasterAction } from '~~/server/services/master-actions'
import { registry } from '~~/server/ws/state'
import { DomainError } from '~~/shared/errors'

// v2b: il master archivia la party. Mette archivedAt, logga audit e
// disconnette tutti i WS aperti per quel seed con close-code 4004 'archived'
// così il client può mostrare un avviso e tornare al browser.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    const party = partyMustExist(db, seed)
    if (party.archivedAt != null) {
      throw new DomainError('conflict', 'already archived')
    }
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'archive')
    }
    archiveParty(db, seed)
    const myPlayer = findPlayerByUserInParty(db, seed, me.id)
    if (myPlayer) {
      logMasterAction(db, {
        partySeed: seed,
        masterId: myPlayer.id,
        action: 'archive_party'
      })
    }
    // Kick di tutte le WS aperte per quel seed.
    for (const conn of registry.listParty(seed)) {
      try {
        conn.ws.close(4004, 'archived')
      } catch { /* no-op */ }
    }
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
