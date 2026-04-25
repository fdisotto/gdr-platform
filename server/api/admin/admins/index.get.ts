import { useDb } from '~~/server/utils/db'
import { requireSuperadmin } from '~~/server/utils/auth-middleware'
import { listSuperadmins } from '~~/server/services/superadmins'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    await requireSuperadmin(event)
    const db = useDb()
    const rows = listSuperadmins(db)
    return rows.map(r => ({
      id: r.id,
      username: r.username,
      mustReset: r.mustReset,
      createdAt: r.createdAt,
      revokedAt: r.revokedAt,
      revokedBy: r.revokedBy,
      isRevoked: r.revokedAt != null
    }))
  } catch (e) {
    toH3Error(e)
  }
})
