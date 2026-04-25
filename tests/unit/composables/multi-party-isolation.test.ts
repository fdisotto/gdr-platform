// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePartyConnections, _resetPartyConnectionsForTests } from '~/composables/usePartyConnections'
import { useChatStore } from '~/stores/chat'
import { usePartyStore, type MeSnapshot, type PartySnapshot } from '~/stores/party'

// Mock minimo di WebSocket: cattura la istanza e permette al test di
// invocare manualmente `dispatchEvent('open' | 'message')` per simulare
// gli eventi del server. Una istanza per `new WebSocket()`.
class MockWebSocket extends EventTarget {
  static OPEN = 1
  static CONNECTING = 0
  static CLOSING = 2
  static CLOSED = 3
  static instances: MockWebSocket[] = []
  url: string
  readyState = MockWebSocket.CONNECTING
  send = vi.fn()
  close = vi.fn(() => {
    this.readyState = MockWebSocket.CLOSED
  })

  constructor(url: string) {
    super()
    this.url = url
    MockWebSocket.instances.push(this)
  }
}

function fakeStateInit(seed: string, areaId: string, body: string) {
  const me: MeSnapshot = {
    id: `me-${seed}`,
    nickname: `nick-${seed}`,
    role: 'user',
    currentAreaId: areaId
  }
  const party: PartySnapshot = {
    seed,
    cityName: `City ${seed}`,
    createdAt: 0,
    lastActivityAt: 0
  }
  return {
    type: 'state:init',
    me,
    party,
    players: [],
    areasState: [],
    messagesByArea: {
      [areaId]: [{
        id: `msg-${seed}`,
        partySeed: seed,
        kind: 'say',
        authorPlayerId: 'p1',
        authorDisplay: 'Anna',
        areaId,
        targetPlayerId: null,
        body,
        rollPayload: null,
        createdAt: 1,
        deletedAt: null,
        deletedBy: null,
        editedAt: null
      }]
    },
    dms: [],
    zombies: [],
    playerPositions: [],
    weatherOverrides: [],
    maps: [],
    transitions: [],
    serverTime: 1
  }
}

function fakeMessageNew(areaId: string, body: string) {
  return {
    type: 'message:new',
    message: {
      id: `dyn-${Math.random().toString(36).slice(2)}`,
      partySeed: 'irrelevant',
      kind: 'say',
      authorPlayerId: 'p2',
      authorDisplay: 'Beto',
      areaId,
      targetPlayerId: null,
      body,
      rollPayload: null,
      createdAt: Date.now(),
      deletedAt: null,
      deletedBy: null,
      editedAt: null
    }
  }
}

function fireOpen(ws: MockWebSocket) {
  ws.readyState = MockWebSocket.OPEN
  ws.dispatchEvent(new Event('open'))
}

function fireMessage(ws: MockWebSocket, payload: unknown) {
  // happy-dom non esporta MessageEvent come Event con `data`: usa un
  // semplice Event a cui aggiungiamo la proprietà `data` aspettata dal
  // listener.
  const ev = new Event('message') as Event & { data?: string }
  ev.data = JSON.stringify(payload)
  ws.dispatchEvent(ev)
}

describe('multi-party isolation: handleEvent dispatcha verso store keyed', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    MockWebSocket.instances = []
    vi.stubGlobal('WebSocket', MockWebSocket)
    _resetPartyConnectionsForTests()
  })

  afterEach(() => {
    _resetPartyConnectionsForTests()
    vi.unstubAllGlobals()
  })

  it('state:init su connection A non contamina store di B', () => {
    const conns = usePartyConnections()
    conns.open('seed-A')
    conns.open('seed-B')
    const [wsA, wsB] = MockWebSocket.instances
    expect(wsA && wsB).toBeTruthy()

    fireOpen(wsA!)
    fireMessage(wsA!, fakeStateInit('seed-A', 'piazza', 'msg-from-A'))

    fireOpen(wsB!)
    fireMessage(wsB!, fakeStateInit('seed-B', 'piazza', 'msg-from-B'))

    const chatA = useChatStore('seed-A')
    const chatB = useChatStore('seed-B')
    expect(chatA.forArea('piazza').map(m => m.body)).toEqual(['msg-from-A'])
    expect(chatB.forArea('piazza').map(m => m.body)).toEqual(['msg-from-B'])

    const partyA = usePartyStore('seed-A')
    const partyB = usePartyStore('seed-B')
    expect(partyA.party?.seed).toBe('seed-A')
    expect(partyB.party?.seed).toBe('seed-B')
    expect(partyA.me?.nickname).toBe('nick-seed-A')
    expect(partyB.me?.nickname).toBe('nick-seed-B')
  })

  it('message:new su A finisce solo nello store chat di A', () => {
    const conns = usePartyConnections()
    conns.open('seed-A')
    conns.open('seed-B')
    const [wsA, wsB] = MockWebSocket.instances

    // Hydrate base così partyStore.me esiste (il dispatch di message:new
    // la legge per la logica notification sound).
    fireOpen(wsA!)
    fireMessage(wsA!, fakeStateInit('seed-A', 'piazza', 'init-A'))
    fireOpen(wsB!)
    fireMessage(wsB!, fakeStateInit('seed-B', 'piazza', 'init-B'))

    fireMessage(wsA!, fakeMessageNew('piazza', 'live-A-only'))

    const chatA = useChatStore('seed-A')
    const chatB = useChatStore('seed-B')
    const bodiesA = chatA.forArea('piazza').map(m => m.body)
    const bodiesB = chatB.forArea('piazza').map(m => m.body)
    expect(bodiesA).toContain('live-A-only')
    expect(bodiesB).not.toContain('live-A-only')
  })
})
