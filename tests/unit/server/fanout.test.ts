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

describe('shout fanout', () => {
  it('shout arriva in area origine + aree adiacenti + master', () => {
    const connections = [
      conn('alice', 'piazza', 'user'), // origine
      conn('bob', 'chiesa', 'user'), // adiacente a piazza
      conn('carla', 'rifugio', 'user'), // non adiacente
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'shout', areaId: 'piazza' })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob', 'master'])
  })

  it('shout non raggiunge area remota', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('carla', 'rifugio', 'user')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'shout', areaId: 'piazza' })
    expect(result.map(c => c.playerId)).toEqual(['alice'])
  })

  it('shout v2d: usa l\'adjacency passata invece di ADJACENCY legacy', () => {
    // Mappe v2d hanno id custom, non presenti in ADJACENCY MVP. Senza il
    // fix, il fanout per shout cadrebbe a [] e propagherebbe solo
    // all'area corrente (effettivo say).
    const connections = [
      conn('alice', 'voro_a', 'user'), // origine
      conn('bob', 'voro_b', 'user'), // adiacente nell'adjacency v2d
      conn('carla', 'voro_c', 'user') // non adiacente
    ]
    const adjacency = {
      voro_a: ['voro_b'],
      voro_b: ['voro_a'],
      voro_c: []
    }
    const result = pickFanoutRecipients(connections, {
      kind: 'shout', areaId: 'voro_a', adjacency
    })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob'])
  })
})

describe('whisper fanout', () => {
  it('whisper: mittente + target (stessa area) + master', () => {
    const connections = [
      conn('alice', 'piazza', 'user'), // mittente
      conn('bob', 'piazza', 'user'), // target, stessa area
      conn('carla', 'fogne', 'user'), // altro
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, {
      kind: 'whisper', areaId: 'piazza',
      authorPlayerId: 'alice', targetPlayerId: 'bob'
    })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob', 'master'])
  })

  it('whisper: target in altra area non riceve (per i non-master)', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'fogne', 'user'), // target, area diversa
      conn('carla', 'piazza', 'user')
    ]
    const result = pickFanoutRecipients(connections, {
      kind: 'whisper', areaId: 'piazza',
      authorPlayerId: 'alice', targetPlayerId: 'bob'
    })
    // target bob filtrato perché non in area; alice sì (mittente)
    expect(result.map(c => c.playerId).sort()).toEqual(['alice'])
  })
})

describe('dm fanout', () => {
  it('dm: mittente + target (qualunque area) + master', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'fogne', 'user'),
      conn('carla', 'scuola', 'user'),
      conn('master', 'ponte', 'master')
    ]
    const result = pickFanoutRecipients(connections, {
      kind: 'dm', areaId: null,
      authorPlayerId: 'alice', targetPlayerId: 'bob'
    })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob', 'master'])
  })
})

describe('roll fanout', () => {
  it('roll visibile: area + master', () => {
    const connections = [
      conn('alice', 'piazza', 'user'),
      conn('bob', 'piazza', 'user'),
      conn('carla', 'fogne', 'user'),
      conn('master', 'scuola', 'master')
    ]
    const result = pickFanoutRecipients(connections, { kind: 'roll', areaId: 'piazza' })
    expect(result.map(c => c.playerId).sort()).toEqual(['alice', 'bob', 'master'])
  })
})
