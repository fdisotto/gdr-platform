import { useDb } from '~~/server/utils/db'
import { archiveStaleParties } from '~~/server/services/auto-archive'

const SIX_HOURS_MS = 6 * 60 * 60 * 1000

// Plugin Nitro: al boot e ogni 6h, archivia le party inattive da 30 giorni.
// timer.unref() così non blocca il graceful shutdown del processo.
// La logica vera è in services/auto-archive.ts per essere testabile senza
// caricare l'auto-import nitro.
export default defineNitroPlugin(() => {
  const db = useDb()
  const tick = () => {
    try {
      const seeds = archiveStaleParties(db)
      if (seeds.length > 0) {
        console.log(`[auto-archive] archiviate ${seeds.length} party inattive`)
      }
    } catch (e) {
      console.error('[auto-archive] errore:', (e as Error).message)
    }
  }
  tick()
  const timer = setInterval(tick, SIX_HOURS_MS)
  if (typeof timer.unref === 'function') timer.unref()
})
