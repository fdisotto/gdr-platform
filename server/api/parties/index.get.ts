import { createError, getQuery } from 'h3'
import { useDb } from '~~/server/utils/db'
import { toH3Error } from '~~/server/utils/http'
import { requireUser } from '~~/server/utils/auth-middleware'
import { listPartiesForBrowser } from '~~/server/services/parties'
import { BrowserQueryParams } from '~~/shared/protocol/http'

// v2b: browser pubblico delle party. Filtra in base a visibility (private
// invisibili a chi non è membro), filtri opzionali (mine/auto/withSlots),
// ricerca su cityName, sort e paginazione cursor su lastActivityAt.
export default defineEventHandler(async (event) => {
  try {
    const me = await requireUser(event)
    const raw = getQuery(event)
    const parsed = BrowserQueryParams.safeParse(raw)
    if (!parsed.success) {
      throw createError({ statusCode: 400, statusMessage: 'invalid_payload' })
    }
    const q = parsed.data
    const db = useDb()
    const page = listPartiesForBrowser(db, {
      userId: me.id,
      sort: q.sort,
      q: q.q,
      cursor: q.cursor,
      limit: q.limit,
      filters: {
        mine: q.mine != null,
        auto: q.auto != null,
        withSlots: q.withSlots != null
      }
    })
    return page
  } catch (e) {
    toH3Error(e)
  }
})
