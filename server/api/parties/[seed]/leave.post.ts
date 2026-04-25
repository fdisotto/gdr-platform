import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { leaveParty } from '~~/server/services/players'

// v2b: l'utente lascia la party. Soft-delete (leftAt). Se è l'unico master,
// il service throwa 'last_master' → 409 (deve promuovere prima).
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const db = useDb()
    leaveParty(db, seed, me.id)
    return { ok: true }
  } catch (e) {
    toH3Error(e)
  }
})
