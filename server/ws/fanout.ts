import type { ConnectionInfo } from '~~/server/ws/connections'

export type RoleAware = ConnectionInfo & { role: 'user' | 'master' }

export interface FanoutSpec {
  kind: 'say' | 'emote' | 'ooc' | 'whisper' | 'shout' | 'roll' | 'dm' | 'npc' | 'announce' | 'system'
  areaId?: string | null
  targetPlayerId?: string | null
  authorPlayerId?: string | null
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
    case 'dm':
      return spec.targetPlayerId != null
        && (c.playerId === spec.targetPlayerId || c.playerId === spec.authorPlayerId)
    case 'shout':
      return spec.areaId != null && c.areaId === spec.areaId
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
