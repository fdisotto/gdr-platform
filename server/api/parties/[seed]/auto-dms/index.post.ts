import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { isMaster, partyMustExist } from '~~/server/services/parties'
import { createAutoDm } from '~~/server/services/auto-dms'
import { logMasterAction } from '~~/server/services/master-actions'
import { DomainError } from '~~/shared/errors'

export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const seed = getRouterParam(event, 'seed')!
    const body = await readBody<{ subject?: string, body?: string, enabled?: boolean }>(event)
    const subject = (body?.subject ?? '').trim()
    const text = (body?.body ?? '').trim()
    if (!subject || !text) {
      throw new DomainError('invalid_payload', 'subject_and_body_required')
    }
    const db = useDb()
    partyMustExist(db, seed)
    if (!isMaster(db, seed, me.id)) {
      throw new DomainError('master_only', 'auto_dms.create')
    }
    const row = createAutoDm(db, {
      partySeed: seed,
      subject,
      body: text,
      enabled: body?.enabled
    })
    logMasterAction(db, {
      partySeed: seed,
      masterId: me.id,
      action: 'auto-dm.create',
      target: row.id,
      payload: { subject: row.subject }
    })
    return { item: row }
  } catch (e) {
    toH3Error(e)
  }
})
