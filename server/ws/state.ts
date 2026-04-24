import { createConnectionRegistry, type ConnectionRegistry, type ConnectionInfo } from '~~/server/ws/connections'
import { createRateLimiter, type RateLimiter } from '~~/server/ws/rate-limit'
import type { Zombie } from '~~/shared/protocol/ws'

export const registry: ConnectionRegistry = createConnectionRegistry()
export const chatRateLimiter: RateLimiter = createRateLimiter({ windowMs: 1000, maxHits: 5 })

export interface RoleAwareInfo extends ConnectionInfo {
  role: 'user' | 'master'
}

export function sendJson(ws: { send(s: string): void }, event: unknown): void {
  ws.send(JSON.stringify(event))
}

// zombiesByParty: partySeed -> areaId -> zombies[]
const zombiesByParty = new Map<string, Map<string, Zombie[]>>()

export function listPartyZombies(partySeed: string): Zombie[] {
  const byArea = zombiesByParty.get(partySeed)
  if (!byArea) return []
  const result: Zombie[] = []
  for (const arr of byArea.values()) result.push(...arr)
  return result
}

export function addZombie(z: Zombie): void {
  if (!zombiesByParty.has(z.partySeed)) zombiesByParty.set(z.partySeed, new Map())
  const byArea = zombiesByParty.get(z.partySeed)!
  if (!byArea.has(z.areaId)) byArea.set(z.areaId, [])
  byArea.get(z.areaId)!.push(z)
}

export function removeZombie(partySeed: string, id: string): Zombie | null {
  const byArea = zombiesByParty.get(partySeed)
  if (!byArea) return null
  for (const [areaId, arr] of byArea) {
    const idx = arr.findIndex(z => z.id === id)
    if (idx >= 0) {
      const removed = arr[idx]!
      arr.splice(idx, 1)
      if (arr.length === 0) byArea.delete(areaId)
      return removed
    }
  }
  return null
}

export function resetZombiesForParty(partySeed: string): void {
  zombiesByParty.delete(partySeed)
}
