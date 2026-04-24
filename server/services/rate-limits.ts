import { createRateLimiter, type RateLimiter } from '~~/server/ws/rate-limit'

// v2a auth: limitatori condivisi per endpoint /api/auth/*.
// In-memory single-node: ok per MVP; multi-node servirebbe Redis.

// 5 tentativi falliti in 15 min per (username_lower, ip)
export const loginRateLimiter: RateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  maxHits: 5
})

// 3 registrazioni / ora per ip, anti-flood coda pending
export const registerRateLimiter: RateLimiter = createRateLimiter({
  windowMs: 60 * 60 * 1000,
  maxHits: 3
})
