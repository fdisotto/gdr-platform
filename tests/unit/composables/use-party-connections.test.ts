// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePartyConnections, _resetPartyConnectionsForTests } from '~/composables/usePartyConnections'

// Mock minimo di WebSocket nel scope global del test. Il factory chiama new WebSocket() in
// makeConnection alla creazione di ogni connection. Cattura le istanze per ispezione.
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

describe('usePartyConnections factory', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    MockWebSocket.instances = []
    // happy-dom non ha WebSocket nativo: sostituisce
    vi.stubGlobal('WebSocket', MockWebSocket)
    _resetPartyConnectionsForTests()
  })

  afterEach(() => {
    _resetPartyConnectionsForTests()
    vi.unstubAllGlobals()
  })

  it('open(seed) crea una connection nuova e apre il socket', () => {
    const conns = usePartyConnections()
    const c = conns.open('seed-A')
    expect(c.seed).toBe('seed-A')
    expect(MockWebSocket.instances).toHaveLength(1)
    expect(c.status.value).toBe('connecting')
  })

  it('open(seed) idempotente: stessa seed → stessa connection', () => {
    const conns = usePartyConnections()
    const c1 = conns.open('seed-A')
    const c2 = conns.open('seed-A')
    expect(c1).toBe(c2)
    expect(MockWebSocket.instances).toHaveLength(1)
  })

  it('open con seed differenti crea connection separate', () => {
    const conns = usePartyConnections()
    const a = conns.open('seed-A')
    const b = conns.open('seed-B')
    expect(a).not.toBe(b)
    expect(MockWebSocket.instances).toHaveLength(2)
    expect(a.seed).toBe('seed-A')
    expect(b.seed).toBe('seed-B')
  })

  it('close(seed) chiude solo quella connection', () => {
    const conns = usePartyConnections()
    const a = conns.open('seed-A')
    const b = conns.open('seed-B')
    conns.close('seed-A')
    expect(a.status.value).toBe('closed')
    expect(b.status.value).toBe('connecting')
    expect(conns.get('seed-A')).toBeNull()
    expect(conns.get('seed-B')).toBe(b)
  })

  it('closeAll chiude tutte e svuota mappa', () => {
    const conns = usePartyConnections()
    conns.open('seed-A')
    conns.open('seed-B')
    conns.closeAll()
    expect(conns.list()).toHaveLength(0)
  })

  it('list ritorna le connection attive', () => {
    const conns = usePartyConnections()
    conns.open('a')
    conns.open('b')
    conns.open('c')
    const seeds = conns.list().map(c => c.seed).sort()
    expect(seeds).toEqual(['a', 'b', 'c'])
  })

  it('get(seed) ritorna null se non aperta', () => {
    const conns = usePartyConnections()
    expect(conns.get('inesistente')).toBeNull()
  })
})
