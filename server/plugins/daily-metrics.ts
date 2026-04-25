import { useDb } from '~~/server/utils/db'
import {
  recoverMissingDays, computeDailyMetrics, upsertDailyMetrics, getDailyMetrics
} from '~~/server/services/daily-metrics'

const ONE_HOUR_MS = 60 * 60 * 1000
const ONE_DAY_MS = 24 * ONE_HOUR_MS

function isoDay(ms: number): string {
  const d = new Date(ms)
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
  return utc.toISOString().slice(0, 10)
}

// Plugin Nitro: al boot recovera giorni mancanti negli ultimi 30, e ogni ora
// controlla se è cambiato il giorno UTC corrente. Quando cambia, aggrega le
// metriche del giorno appena chiuso (ieri rispetto al new now). Idempotente:
// se la riga esiste già la sovrascrive (lo snapshot vede tutto il giorno).
// timer.unref() per non bloccare graceful shutdown.
export default defineNitroPlugin(() => {
  const db = useDb()

  try {
    const recovered = recoverMissingDays(db, 30)
    if (recovered > 0) {
      console.log(`[daily-metrics] recovered ${recovered} giorni mancanti`)
    }
  } catch (e) {
    console.error('[daily-metrics] recovery boot fallita:', (e as Error).message)
  }

  let lastSeenDay = isoDay(Date.now())
  const tick = () => {
    try {
      const today = isoDay(Date.now())
      if (today !== lastSeenDay) {
        // Giorno cambiato: chiudiamo lastSeenDay (è ieri rispetto a oggi)
        const yesterday = isoDay(Date.now() - ONE_DAY_MS)
        const existing = getDailyMetrics(db, yesterday)
        if (!existing || existing.computedAt < Date.now() - ONE_HOUR_MS) {
          const row = computeDailyMetrics(db, yesterday)
          upsertDailyMetrics(db, row)
          console.log(`[daily-metrics] snapshot ${yesterday} salvato`)
        }
        lastSeenDay = today
      }
    } catch (e) {
      console.error('[daily-metrics] tick errore:', (e as Error).message)
    }
  }

  const timer = setInterval(tick, ONE_HOUR_MS)
  if (typeof timer.unref === 'function') timer.unref()
})
