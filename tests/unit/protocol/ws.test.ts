import { describe, it, expect } from 'vitest'
import { HelloEvent, MESSAGE_KINDS, ServerErrorEvent, ChatSendEvent, MessageNewEvent, TimeTickEvent, StateInitEvent, MoveRequestEvent, PlayerJoinedEvent, PlayerLeftEvent, PlayerMovedEvent, AreaUpdatedEvent, WeatherUpdatedEvent, HistoryFetchEvent, HistoryBatchEvent } from '~~/shared/protocol/ws'

describe('HelloEvent', () => {
  it('accetta seed uuid e sessionToken', () => {
    const ok = HelloEvent.safeParse({
      type: 'hello',
      seed: '550e8400-e29b-41d4-a716-446655440000',
      sessionToken: 'abc'
    })
    expect(ok.success).toBe(true)
  })

  it('rifiuta seed non-uuid', () => {
    expect(HelloEvent.safeParse({
      type: 'hello',
      seed: 'not-a-uuid',
      sessionToken: 'abc'
    }).success).toBe(false)
  })
})

describe('MESSAGE_KINDS', () => {
  it('contiene tutti i 10 kind', () => {
    const expected = ['say', 'whisper', 'emote', 'ooc', 'roll', 'shout', 'dm', 'npc', 'announce', 'system']
    for (const k of expected) expect(MESSAGE_KINDS).toContain(k)
  })
})

describe('ServerErrorEvent', () => {
  it('accetta code e detail', () => {
    expect(ServerErrorEvent.safeParse({
      type: 'error', code: 'not_found', detail: 'party X'
    }).success).toBe(true)
  })
})

describe('ChatSendEvent', () => {
  it('accetta say con body', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'say', body: 'ciao', areaId: 'piazza'
    }).success).toBe(true)
  })
  it('rifiuta body vuoto', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'say', body: '', areaId: 'piazza'
    }).success).toBe(false)
  })
  it('rifiuta body oltre 2000 char', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'say', body: 'x'.repeat(2001), areaId: 'piazza'
    }).success).toBe(false)
  })
  it('rifiuta kind non tra say/emote/ooc/whisper/shout/roll/dm', () => {
    expect(ChatSendEvent.safeParse({
      type: 'chat:send', kind: 'system', body: 'x', areaId: 'piazza'
    }).success).toBe(false)
  })
})

describe('MessageNewEvent', () => {
  it('accetta shape corretta', () => {
    expect(MessageNewEvent.safeParse({
      type: 'message:new',
      message: {
        id: 'x', partySeed: 'p', kind: 'say',
        authorPlayerId: 'a', authorDisplay: 'A',
        areaId: 'piazza', targetPlayerId: null, body: 'ciao',
        rollPayload: null, createdAt: 1, deletedAt: null,
        deletedBy: null, editedAt: null
      }
    }).success).toBe(true)
  })
})

describe('TimeTickEvent', () => {
  it('accetta serverTime', () => {
    expect(TimeTickEvent.safeParse({ type: 'time:tick', serverTime: 12345 }).success).toBe(true)
  })
})

describe('StateInitEvent', () => {
  it('accetta snapshot base', () => {
    expect(StateInitEvent.safeParse({
      type: 'state:init',
      me: { id: 'a', nickname: 'A', role: 'user', currentAreaId: 'piazza' },
      party: { seed: 'uuid', cityName: 'City', createdAt: 1, lastActivityAt: 1 },
      players: [],
      areasState: [],
      messagesByArea: {},
      dms: [],
      zombies: [],
      playerPositions: [],
      weatherOverrides: [],
      maps: [],
      transitions: [],
      serverTime: 1
    }).success).toBe(true)
  })
})

describe('MoveRequestEvent', () => {
  it('accetta shape corretta', () => {
    expect(MoveRequestEvent.safeParse({
      type: 'move:request', toAreaId: 'fogne'
    }).success).toBe(true)
  })
  it('rifiuta senza toAreaId', () => {
    expect(MoveRequestEvent.safeParse({
      type: 'move:request'
    }).success).toBe(false)
  })
})

describe('PlayerJoinedEvent', () => {
  it('accetta player snapshot', () => {
    expect(PlayerJoinedEvent.safeParse({
      type: 'player:joined',
      player: { id: 'x', nickname: 'A', role: 'user', currentAreaId: 'piazza' }
    }).success).toBe(true)
  })
})

describe('PlayerLeftEvent', () => {
  it('accetta playerId', () => {
    expect(PlayerLeftEvent.safeParse({
      type: 'player:left', playerId: 'x'
    }).success).toBe(true)
  })
})

describe('PlayerMovedEvent', () => {
  it('accetta from/to + teleported', () => {
    expect(PlayerMovedEvent.safeParse({
      type: 'player:moved', playerId: 'x',
      fromAreaId: 'piazza', toAreaId: 'fogne', teleported: false
    }).success).toBe(true)
  })
})

describe('AreaUpdatedEvent', () => {
  it('accetta patch area state', () => {
    expect(AreaUpdatedEvent.safeParse({
      type: 'area:updated',
      patch: {
        partySeed: 'p', areaId: 'piazza',
        status: 'intact', customName: null, notes: null
      }
    }).success).toBe(true)
  })
})

describe('WeatherUpdatedEvent', () => {
  it('accetta effective weather', () => {
    expect(WeatherUpdatedEvent.safeParse({
      type: 'weather:updated', areaId: 'piazza',
      effective: { code: 'fog', intensity: 0.8, label: 'Nebbia' }
    }).success).toBe(true)
  })
  it('accetta areaId null (globale)', () => {
    expect(WeatherUpdatedEvent.safeParse({
      type: 'weather:updated', areaId: null,
      effective: { code: 'storm', intensity: 0.5, label: 'Tempesta' }
    }).success).toBe(true)
  })
  it('accetta effective null (override rimosso)', () => {
    expect(WeatherUpdatedEvent.safeParse({
      type: 'weather:updated', areaId: 'piazza',
      effective: null
    }).success).toBe(true)
  })
})

describe('HistoryFetchEvent', () => {
  it('accetta fetch per area', () => {
    expect(HistoryFetchEvent.safeParse({
      type: 'chat:history-before', areaId: 'piazza', before: 1000, limit: 50
    }).success).toBe(true)
  })
  it('accetta fetch per threadKey', () => {
    expect(HistoryFetchEvent.safeParse({
      type: 'chat:history-before', threadKey: 'a::b', before: 1000, limit: 50
    }).success).toBe(true)
  })
  it('rifiuta limit fuori range', () => {
    expect(HistoryFetchEvent.safeParse({
      type: 'chat:history-before', areaId: 'piazza', before: 1, limit: 5000
    }).success).toBe(false)
  })
})

describe('HistoryBatchEvent', () => {
  it('accetta batch area', () => {
    expect(HistoryBatchEvent.safeParse({
      type: 'chat:history-batch',
      areaId: 'piazza',
      messages: [],
      hasMore: true
    }).success).toBe(true)
  })
  it('accetta batch thread', () => {
    expect(HistoryBatchEvent.safeParse({
      type: 'chat:history-batch',
      threadKey: 'a::b',
      messages: [],
      hasMore: false
    }).success).toBe(true)
  })
})
