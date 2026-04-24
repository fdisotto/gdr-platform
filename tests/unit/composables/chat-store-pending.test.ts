// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useChatStore, type ChatMessage } from '~/stores/chat'

function mkMsg(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: overrides.id ?? `msg-${Math.random().toString(36).slice(2)}`,
    partySeed: 'seed',
    kind: 'say',
    authorPlayerId: 'p1',
    authorDisplay: 'Anna',
    areaId: 'piazza',
    targetPlayerId: null,
    body: 'ciao',
    rollPayload: null,
    createdAt: Date.now(),
    deletedAt: null,
    deletedBy: null,
    editedAt: null,
    ...overrides
  }
}

describe('chat store — pending reconciliation', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('appendPending aggiunge con flag pending', () => {
    const s = useChatStore()
    const m = mkMsg({ id: 'pending-1', pending: true })
    s.appendPending(m)
    expect(s.forArea('piazza')).toHaveLength(1)
    expect(s.forArea('piazza')[0]!.pending).toBe(true)
  })

  it('append con match echo rimuove il pending corrispondente', () => {
    const s = useChatStore()
    const pending = mkMsg({ id: 'pending-1', pending: true, body: 'ciao', createdAt: 1000 })
    const echo = mkMsg({ id: 'server-1', body: 'ciao', createdAt: 1050 })
    s.appendPending(pending)
    s.append(echo)
    const list = s.forArea('piazza')
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('server-1')
    expect(list[0]!.pending).toBeUndefined()
  })

  it('append con body diverso NON riconcilia', () => {
    const s = useChatStore()
    s.appendPending(mkMsg({ id: 'p1', pending: true, body: 'ciao' }))
    s.append(mkMsg({ id: 's1', body: 'altro' }))
    expect(s.forArea('piazza')).toHaveLength(2)
  })

  it('append con autore diverso NON riconcilia', () => {
    const s = useChatStore()
    s.appendPending(mkMsg({ id: 'p1', pending: true, authorPlayerId: 'p1' }))
    s.append(mkMsg({ id: 's1', authorPlayerId: 'p2' }))
    expect(s.forArea('piazza')).toHaveLength(2)
  })

  it('append fuori finestra temporale NON riconcilia', () => {
    const s = useChatStore()
    s.appendPending(mkMsg({ id: 'p1', pending: true, createdAt: 1000 }))
    s.append(mkMsg({ id: 's1', createdAt: 200_000 }))
    expect(s.forArea('piazza')).toHaveLength(2)
  })

  it('appendPendingDm e appendDm riconciliano il thread', () => {
    const s = useChatStore()
    const selfId = 'me'
    const pending = mkMsg({
      id: 'pending-dm-1',
      pending: true,
      kind: 'dm',
      areaId: null,
      authorPlayerId: selfId,
      targetPlayerId: 'other',
      body: 'missiva',
      createdAt: 2000
    })
    const echo = mkMsg({
      id: 'server-dm-1',
      kind: 'dm',
      areaId: null,
      authorPlayerId: selfId,
      targetPlayerId: 'other',
      body: 'missiva',
      createdAt: 2050
    })
    s.appendPendingDm(pending, selfId)
    s.appendDm(echo, selfId)
    const key = s.threadKey(selfId, 'other')
    const list = s.forThread(key)
    expect(list).toHaveLength(1)
    expect(list[0]!.id).toBe('server-dm-1')
    expect(list[0]!.pending).toBeUndefined()
  })
})
