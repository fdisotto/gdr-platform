import { createError } from 'h3'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { partyMustExist } from '~~/server/services/parties'
import { findPlayerByUserInParty } from '~~/server/services/players'
import { createRequest } from '~~/server/services/party-join-requests'
import { JoinRequestCreateBody } from '~~/shared/protocol/http'
import { DomainError } from '~~/shared/errors'

// v2b: l'utente crea una richiesta di adesione per party con
// joinPolicy=request. Vincoli: party non archiviata, utente non già membro,
// nessuna pending preesistente (gestito dal vincolo unique nel service).
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const raw = await readBody(event)
    const parsed = JoinRequestCreateBody.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const db = useDb()
    const party = partyMustExist(db, seed)
    if (party.archivedAt != null) {
      throw new DomainError('archived', `party ${seed}`)
    }
    if (findPlayerByUserInParty(db, seed, me.id)) {
      throw new DomainError('conflict', 'already member')
    }
    const req = createRequest(db, {
      partySeed: seed,
      userId: me.id,
      displayName: parsed.data.displayName,
      message: parsed.data.message
    })
    return { request: req }
  } catch (e) {
    toH3Error(e)
  }
})
