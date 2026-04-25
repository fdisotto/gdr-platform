import { createRateLimiter, type RateLimiter } from '~~/server/ws/rate-limit'
import { getSettingNumber } from '~~/server/services/system-settings'
import type { Db } from '~~/server/db/client'

// v2a auth → v2c: i rate limiter sono factory che leggono i parametri dai
// system_settings al primo uso. Cache in-memory dell'istanza per evitare di
// ricreare la map degli timestamp ad ogni request: invalidata quando i
// parametri cambiano (chiave delle settings) tramite invalidateRateLimiters().

// Default fallback se la setting è assente (DB nudo, recovery)
const DEFAULTS = {
  loginMaxFailures: 5,
  loginWindowMinutes: 15,
  registerMaxPerHour: 3
}

interface CachedLimiter {
  limiter: RateLimiter
  // parametri con cui è stata costruita: se cambiano, ricreiamo
  paramsKey: string
}

let loginCached: CachedLimiter | null = null
let registerCached: CachedLimiter | null = null

function readLoginParams(db: Db): { maxHits: number, windowMs: number } {
  return {
    maxHits: getSettingNumber(db, 'limits.loginRateMaxFailures', DEFAULTS.loginMaxFailures),
    windowMs: getSettingNumber(db, 'limits.loginRateWindowMinutes', DEFAULTS.loginWindowMinutes) * 60_000
  }
}

function readRegisterParams(db: Db): { maxHits: number, windowMs: number } {
  return {
    maxHits: getSettingNumber(db, 'limits.registerRateMaxPerHour', DEFAULTS.registerMaxPerHour),
    windowMs: 60 * 60_000
  }
}

export function getLoginRateLimiter(db: Db): RateLimiter {
  const params = readLoginParams(db)
  const key = `${params.maxHits}:${params.windowMs}`
  if (!loginCached || loginCached.paramsKey !== key) {
    loginCached = { limiter: createRateLimiter(params), paramsKey: key }
  }
  return loginCached.limiter
}

export function getRegisterRateLimiter(db: Db): RateLimiter {
  const params = readRegisterParams(db)
  const key = `${params.maxHits}:${params.windowMs}`
  if (!registerCached || registerCached.paramsKey !== key) {
    registerCached = { limiter: createRateLimiter(params), paramsKey: key }
  }
  return registerCached.limiter
}

// Invalida i rate limiter cached: chiamato quando le settings di rate sono
// aggiornate, così la prossima invocazione costruisce con i nuovi parametri.
export function invalidateRateLimiters(): void {
  loginCached = null
  registerCached = null
}
