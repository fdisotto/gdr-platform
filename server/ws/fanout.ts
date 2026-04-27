import type { ConnectionInfo } from '~~/server/ws/connections'
import { ADJACENCY, type AreaId } from '~~/shared/map/areas'

export type RoleAware = ConnectionInfo & { role: 'user' | 'master' }

export interface FanoutSpec {
  kind: 'say' | 'emote' | 'ooc' | 'whisper' | 'shout' | 'roll' | 'dm' | 'npc' | 'announce' | 'system'
  areaId?: string | null
  targetPlayerId?: string | null
  authorPlayerId?: string | null
  // v2d: adjacency da usare per il 'shout' (area corrente + vicini).
  // Quando passata sostituisce l'ADJACENCY legacy MVP, che non
  // conosce le aree generate dei mapType v2d. Se assente, fallback su
  // ADJACENCY legacy per le party pre-multi-mappa.
  adjacency?: Record<string, readonly string[]>
}

export function pickFanoutRecipients(connections: readonly RoleAware[], spec: FanoutSpec): RoleAware[] {
  const out: RoleAware[] = []
  for (const c of connections) {
    if (shouldReceive(c, spec)) out.push(c)
  }
  return out
}

function shouldReceive(c: RoleAware, spec: FanoutSpec): boolean {
  if (c.role === 'master') return true

  switch (spec.kind) {
    case 'say':
    case 'emote':
    case 'ooc':
      return spec.areaId != null && c.areaId === spec.areaId
    case 'whisper':
      if (spec.targetPlayerId == null) return false
      if (c.playerId === spec.authorPlayerId) return true
      // target riceve solo se nella stessa area del mittente
      return c.playerId === spec.targetPlayerId && spec.areaId != null && c.areaId === spec.areaId
    case 'dm':
      return spec.targetPlayerId != null
        && (c.playerId === spec.targetPlayerId || c.playerId === spec.authorPlayerId)
    case 'shout': {
      if (spec.areaId == null) return false
      if (c.areaId === spec.areaId) return true
      const neigh = spec.adjacency
        ? (spec.adjacency[spec.areaId] ?? [])
        : (ADJACENCY[spec.areaId as AreaId] ?? [])
      return (neigh as readonly string[]).includes(c.areaId)
    }
    case 'roll':
      return spec.areaId != null && c.areaId === spec.areaId
    case 'npc':
      return spec.areaId != null && c.areaId === spec.areaId
    case 'announce':
      return true
    case 'system':
      return true
    default:
      return false
  }
}
