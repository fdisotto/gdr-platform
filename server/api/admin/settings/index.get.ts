import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listSettings } from '~~/server/services/system-settings'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const db = useDb()
    return listSettings(db)
  } catch (e) {
    toH3Error(e)
  }
})
