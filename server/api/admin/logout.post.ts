import { getCookie, getRequestIP, sendNoContent } from 'h3'
import { useDb } from '~~/server/utils/db'
import { readAuthIdentity } from '~~/server/utils/auth-middleware'
import { revokeSession } from '~~/server/services/sessions'
import { SESSION_COOKIE_NAME, clearSessionCookie } from '~~/server/utils/session-cookie'
import { logAuthEvent } from '~~/server/services/auth-events'
import { toH3Error } from '~~/server/utils/http'

export default defineEventHandler(async (event) => {
  try {
    const identity = await readAuthIdentity(event)
    const token = getCookie(event, SESSION_COOKIE_NAME)
    if (token) {
      const db = useDb()
      revokeSession(db, token)
      if (identity) {
        const ip = getRequestIP(event, { xForwardedFor: true }) ?? undefined
        logAuthEvent(db, {
          actorKind: identity.kind,
          actorId: identity.id,
          event: 'logout',
          ip
        })
      }
    }
    clearSessionCookie(event)
    return sendNoContent(event)
  } catch (e) {
    toH3Error(e)
  }
})
