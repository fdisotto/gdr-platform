export interface WsLike {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export interface ConnectionInfo {
  ws: WsLike
  partySeed: string
  playerId: string
  areaId: string
}

export interface ConnectionRegistry {
  register(ws: WsLike, info: Omit<ConnectionInfo, 'ws'>): void
  unregister(ws: WsLike): ConnectionInfo | undefined
  getPlayerConn(partySeed: string, playerId: string): ConnectionInfo | undefined
  listParty(partySeed: string): ConnectionInfo[]
  listArea(partySeed: string, areaId: string): ConnectionInfo[]
  updateArea(partySeed: string, playerId: string, areaId: string): void
  all(): ConnectionInfo[]
}

export function createConnectionRegistry(): ConnectionRegistry {
  const byWs = new Map<WsLike, ConnectionInfo>()
  const byPlayer = new Map<string, ConnectionInfo>()

  function key(partySeed: string, playerId: string): string {
    return `${partySeed}::${playerId}`
  }

  function register(ws: WsLike, info: Omit<ConnectionInfo, 'ws'>) {
    const existing = byPlayer.get(key(info.partySeed, info.playerId))
    if (existing && existing.ws !== ws) {
      byWs.delete(existing.ws)
      try {
        existing.ws.close(4000, 'session_superseded')
      } catch { /* no-op */ }
    }
    const full: ConnectionInfo = { ws, ...info }
    byWs.set(ws, full)
    byPlayer.set(key(info.partySeed, info.playerId), full)
  }

  function unregister(ws: WsLike): ConnectionInfo | undefined {
    const info = byWs.get(ws)
    if (!info) return undefined
    byWs.delete(ws)
    const existing = byPlayer.get(key(info.partySeed, info.playerId))
    if (existing && existing.ws === ws) {
      byPlayer.delete(key(info.partySeed, info.playerId))
    }
    return info
  }

  function getPlayerConn(partySeed: string, playerId: string): ConnectionInfo | undefined {
    return byPlayer.get(key(partySeed, playerId))
  }

  function listParty(partySeed: string): ConnectionInfo[] {
    const out: ConnectionInfo[] = []
    for (const info of byWs.values()) {
      if (info.partySeed === partySeed) out.push(info)
    }
    return out
  }

  function listArea(partySeed: string, areaId: string): ConnectionInfo[] {
    return listParty(partySeed).filter(c => c.areaId === areaId)
  }

  function updateArea(partySeed: string, playerId: string, areaId: string) {
    const conn = byPlayer.get(key(partySeed, playerId))
    if (conn) conn.areaId = areaId
  }

  function all(): ConnectionInfo[] {
    return Array.from(byWs.values())
  }

  return { register, unregister, getPlayerConn, listParty, listArea, updateArea, all }
}
