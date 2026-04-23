import { createConnectionRegistry, type ConnectionRegistry, type ConnectionInfo } from '~~/server/ws/connections'
import { createRateLimiter, type RateLimiter } from '~~/server/ws/rate-limit'

export const registry: ConnectionRegistry = createConnectionRegistry()
export const chatRateLimiter: RateLimiter = createRateLimiter({ windowMs: 1000, maxHits: 5 })

export interface RoleAwareInfo extends ConnectionInfo {
  role: 'user' | 'master'
}

export function sendJson(ws: { send(s: string): void }, event: unknown): void {
  ws.send(JSON.stringify(event))
}
