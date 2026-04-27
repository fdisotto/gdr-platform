import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { findAutoDm, updateAutoDm } from '~~/server/services/auto-dms'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const id = getRouterParam(event, 'id')!
    const body = await readBody<{ subject?: string, body?: string, enabled?: boolean }>(event)
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'auto_dms.update')
    }
    const existing = findAutoDm(db, id)
    if (!existing || existing.partySeed !== seed) {
      throw new DomainError('not_found', `auto_dm ${id}`)
    }
    const updated = updateAutoDm(db, id, {
      subject: body?.subject,
      body: body?.body,
      enabled: body?.enabled
    })
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'auto-dm.update',
      target: id,
      payload: { subject: updated?.subject, enabled: updated?.enabled }
    })
    return { item: updated }
  } catch (e) {
    toH3Error(e)
  }
})
