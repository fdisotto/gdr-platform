import { describe, it, expect, beforeEach } from 'vitest'
import { createConnectionRegistry, type WsLike } from '~~/server/ws/connections'

function mockWs(): WsLike & { sent: unknown[] } {
  const sent: unknown[] = []
  return {
    send(data: string) { sent.push(data) },
    close() {},
    sent
  } as WsLike & { sent: unknown[] }
}

let registry: ReturnType<typeof createConnectionRegistry>

beforeEach(() => {
  registry = createConnectionRegistry()
})

describe('connection registry', () => {
  it('register + lookup by party + player', () => {
    const ws = mockWs()
    registry.register(ws, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    expect(registry.getPlayerConn('p1', 'alice')?.ws).toBe(ws)
  })

  it('register sostituisce connessione precedente stesso player', () => {
    const a = mockWs()
    const b = mockWs()
    registry.register(a, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.register(b, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    expect(registry.getPlayerConn('p1', 'alice')?.ws).toBe(b)
  })

  it('listParty ritorna tutte le connessioni della party', () => {
    registry.register(mockWs(), { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.register(mockWs(), { partySeed: 'p1', playerId: 'bob', areaId: 'fogne' })
    registry.register(mockWs(), { partySeed: 'p2', playerId: 'carla', areaId: 'piazza' })
    expect(registry.listParty('p1').map(c => c.playerId).sort()).toEqual(['alice', 'bob'])
  })

  it('updateArea cambia areaId', () => {
    const ws = mockWs()
    registry.register(ws, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.updateArea('p1', 'alice', 'fogne')
    expect(registry.getPlayerConn('p1', 'alice')?.areaId).toBe('fogne')
  })

  it('unregister rimuove la connessione', () => {
    const ws = mockWs()
    registry.register(ws, { partySeed: 'p1', playerId: 'alice', areaId: 'piazza' })
    registry.unregister(ws)
    expect(registry.getPlayerConn('p1', 'alice')).toBeUndefined()
  })
})
