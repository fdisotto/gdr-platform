import { createError, defineEventHandler, getRequestURL } from 'h3'
import { useDb } from '~~/server/utils/db'
import { getSettingBoolean, getSettingString } from '~~/server/services/system-settings'
import { readAuthIdentity } from '~~/server/utils/auth-middleware'

// Path che bypassano il blocco maintenance: i superadmin devono comunque
// poter accedere alla console e all'auth, e il client deve poter leggere
// lo stato pubblico per redirezionare. Per le pagine SPA (non /api) il
// middleware client gestisce il redirect a /maintenance.
const BYPASS_PREFIXES = [
  '/api/admin/',
  '/api/auth/login',
  '/api/auth/me',
  '/api/auth/logout',
  '/api/system/'
]

function isBypassed(pathname: string): boolean {
  for (const prefix of BYPASS_PREFIXES) {
    if (pathname.startsWith(prefix)) return true
  }
  return false
}

// Server middleware Nitro: ad ogni request verifica `system.maintenanceMode`.
// Se attivo e l'utente non è superadmin, ritorna 503 sulle API non
// bypassate. Le richieste SPA (non /api/) passano sempre.
export default defineEventHandler(async (event) => {
  const url = getRequestURL(event)
  const pathname = url.pathname
  if (!pathname.startsWith('/api/')) return
  if (isBypassed(pathname)) return

  const db = useDb()
  if (!getSettingBoolean(db, 'system.maintenanceMode', false)) return

  const identity = await readAuthIdentity(event)
  if (identity?.kind === 'superadmin') return

  const message = getSettingString(
    db, 'system.maintenanceMessage', 'Manutenzione in corso. Torniamo presto.'
  )
  throw createError({
    statusCode: 503,
    statusMessage: 'maintenance',
    data: { code: 'maintenance', message }
  })
})
