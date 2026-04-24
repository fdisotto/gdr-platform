import { createConnectionRegistry, type ConnectionRegistry, type ConnectionInfo } from '~~/server/ws/connections'
import { createRateLimiter, type RateLimiter } from '~~/server/ws/rate-limit'
import type { Zombie, PlayerPosition } from '~~/shared/protocol/ws'
import type { Db } from '~~/server/db/client'
import { listZombiesForParty } from '~~/server/services/zombies'
import { listPartyPositions } from '~~/server/services/player-positions'

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

export function moveZombie(partySeed: string, id: string, x: number, y: number): Zombie | null {
  const byArea = zombiesByParty.get(partySeed)
  if (!byArea) return null
  for (const arr of byArea.values()) {
    const z = arr.find(z => z.id === id)
    if (z) {
      z.x = x
      z.y = y
      return z
    }
  }
  return null
}

export function addZombies(zombies: Zombie[]): void {
  for (const z of zombies) addZombie(z)
}

export function resetZombiesForParty(partySeed: string): void {
  zombiesByParty.delete(partySeed)
}

// Hydrate lazy: la prima volta che una party viene contattata dopo il boot
// del server, carichiamo zombi e posizioni dal DB. Successive chiamate sono
// no-op: la fonte di verità in-memory è già popolata e tenuta sincronizzata
// dai write-through nei handler.
const hydratedParties = new Set<string>()
export function ensurePartyHydrated(db: Db, partySeed: string): void {
  if (hydratedParties.has(partySeed)) return
  hydratedParties.add(partySeed)
  // Non pulisco le mappe (è possibile che un altro processo scriva; ma qui
  // siamo single-node, quindi se il Set non lo contiene è boot fresh).
  for (const z of listZombiesForParty(db, partySeed)) addZombie(z)
  for (const pos of listPartyPositions(db, partySeed)) {
    setPlayerPosition(partySeed, pos.playerId, pos.areaId, pos.x, pos.y)
  }
}

// Helper per test: azzera lo stato hydrated
export function _resetHydratedForTests(): void {
  hydratedParties.clear()
  zombiesByParty.clear()
  positionsByParty.clear()
}

// positions: partySeed -> areaId -> playerId -> {x, y}
const positionsByParty = new Map<string, Map<string, Map<string, { x: number, y: number }>>>()

export function listPlayerPositions(partySeed: string): PlayerPosition[] {
  const byArea = positionsByParty.get(partySeed)
  if (!byArea) return []
  const out: PlayerPosition[] = []
  for (const [areaId, byPlayer] of byArea) {
    for (const [playerId, pos] of byPlayer) {
      out.push({ playerId, areaId, x: pos.x, y: pos.y })
    }
  }
  return out
}

export function setPlayerPosition(partySeed: string, playerId: string, areaId: string, x: number, y: number): void {
  if (!positionsByParty.has(partySeed)) positionsByParty.set(partySeed, new Map())
  const byArea = positionsByParty.get(partySeed)!
  if (!byArea.has(areaId)) byArea.set(areaId, new Map())
  byArea.get(areaId)!.set(playerId, { x, y })
}

export function resetPlayerPosition(partySeed: string, playerId: string): void {
  const byArea = positionsByParty.get(partySeed)
  if (!byArea) return
  for (const byPlayer of byArea.values()) {
    byPlayer.delete(playerId)
  }
}
