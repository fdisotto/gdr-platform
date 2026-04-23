import { describe, it, expect } from 'vitest'
import { pickFanoutRecipients } from '~~/server/ws/fanout'
import type { ConnectionInfo } from '~~/server/ws/connections'

function conn(playerId: string, areaId: string, role: 'user' | 'master'): ConnectionInfo & { role: 'user' | 'master' } {
  return {
    ws: { send: () => {}, close: () => {} },
    partySeed: 'p', playerId, areaId, role
  }
}

describe('pickFanoutRecipients', () => {
  it('say: player in area + master', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'fogne', 'user'),
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, {
      kind: 'say', areaId: 'piazza'
    })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'master'])
  })

  it('emote stesso comportamento di say', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'piazza', 'user'),
      conn('carla', 'fogne', 'user')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'emote', areaId: 'piazza' })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob'])
  })

  it('ooc stesso comportamento di say', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'ooc', areaId: 'piazza' })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'master'])
  })

  it('master riceve anche da aree diverse', () => {
    const connections = [conn('master', 'scuola', 'master')]
    const result = pickFanoutRecipients(connections, { kind: 'say', areaId: 'piazza' })
    expect(result.map(c => c.playerId)).toEqual(['master'])
  })
})
