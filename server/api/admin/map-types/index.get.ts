import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listMapTypes } from '~~/server/services/map-types'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    return listMapTypes(useDb())
  } catch (e) {
    toH3Error(e)
  }
})
