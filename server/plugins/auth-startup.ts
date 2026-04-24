import { useDb } from '~~/server/utils/db'
import { cleanupExpiredSessions } from '~~/server/services/sessions'
import { listSuperadmins } from '~~/server/services/superadmins'
import { verifyPassword } from '~~/server/services/auth'

// Plugin di startup auth eseguito una volta al boot del server Nitro:
//  1. Rimuove le sessioni già scadute dal DB (sliding su findSession
//     maschera quelle scadute ma non le elimina: lo fa questo cleanup).
//  2. Verifica se un superadmin ha ancora le credenziali di default
//     (admin/changeme, mustReset=true) e in tal caso stampa un warning.
export default defineNitroPlugin(async () => {
  const db = useDb()

  const removed = cleanupExpiredSessions(db)
  if (removed > 0) {
    console.log(`[auth] cleanup: ${removed} sessioni scadute rimosse`)
  }

  const sas = listSuperadmins(db)
  for (const sa of sas) {
    if (sa.mustReset && await verifyPassword('changeme', sa.passwordHash)) {
      console.warn(
        `[auth] ATTENZIONE: superadmin "${sa.username}" usa ancora la password di default (changeme). `
        + 'Cambiala dal pannello /admin prima di andare live.'
      )
    }
  }
})
