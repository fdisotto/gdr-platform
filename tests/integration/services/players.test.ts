import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import {
  joinParty, findPlayerBySession, findPlayerByNickname,
  isBanned, listOnlinePlayers, touchPlayer, updatePlayerArea
} from '~~/server/services/players'
import { bans } from '~~/server/db/schema'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterUserId: string
let annaUserId: string

beforeEach(async () => {
  db = createTestDb()
  masterUserId = await createApprovedUser(db, 'master')
  annaUserId = await createApprovedUser(db, 'anna')
  const r = await createParty(db, { userId: masterUserId, displayName: 'Master' })
  seed = r.seed
})

describe('players service', () => {
  it('joinParty crea player nell area piazza', () => {
    const p = joinParty(db, seed, 'Anna', { userId: annaUserId })
    expect(p.role).toBe('user')
    expect(p.currentAreaId).toBe('piazza')
    expect(p.sessionToken.length).toBeGreaterThan(10)
  })

  it('joinParty rifiuta nickname già usato (conflict)', async () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    const otherUserId = await createApprovedUser(db, 'other')
    expect(() => joinParty(db, seed, 'Anna', { userId: otherUserId })).toThrowError(/conflict/)
  })

  it('joinParty rifiuta se party inesistente', () => {
    expect(() => joinParty(db, 'not-exist', 'Anna', { userId: annaUserId })).toThrowError(/not_found/)
  })

  it('joinParty rifiuta nickname bannato', () => {
    db.insert(bans).values({
      partySeed: seed, nicknameLower: 'anna', reason: null, bannedAt: Date.now()
    }).run()
    expect(() => joinParty(db, seed, 'Anna', { userId: annaUserId })).toThrowError(/banned/)
  })

  it('findPlayerBySession trova il player', () => {
    const p = joinParty(db, seed, 'Anna', { userId: annaUserId })
    const f = findPlayerBySession(db, seed, p.sessionToken)
    expect(f?.id).toBe(p.id)
  })

  it('findPlayerByNickname case-insensitive', () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    expect(findPlayerByNickname(db, seed, 'anna')?.nickname).toBe('Anna')
    expect(findPlayerByNickname(db, seed, 'ANNA')?.nickname).toBe('Anna')
  })

  it('listOnlinePlayers include il master iniziale e i nuovi', async () => {
    const lucaUserId = await createApprovedUser(db, 'luca')
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    joinParty(db, seed, 'Luca', { userId: lucaUserId })
    const all = listOnlinePlayers(db, seed)
    expect(all.map(p => p.nickname).sort()).toEqual(['Anna', 'Luca', 'Master'])
  })

  it('isBanned rileva ban', () => {
    expect(isBanned(db, seed, 'Anna')).toBe(false)
    db.insert(bans).values({
      partySeed: seed, nicknameLower: 'anna', reason: null, bannedAt: Date.now()
    }).run()
    expect(isBanned(db, seed, 'ANNA')).toBe(true)
  })

  it('touchPlayer aggiorna lastSeenAt', () => {
    const p = joinParty(db, seed, 'Anna', { userId: annaUserId })
    const before = p.lastSeenAt
    const later = before + 1000
    touchPlayer(db, p.id, later)
    const again = findPlayerBySession(db, seed, p.sessionToken)
    expect(again?.lastSeenAt).toBe(later)
  })

  it('updatePlayerArea scrive la nuova area corrente', () => {
    const p = joinParty(db, seed, 'Anna', { userId: annaUserId })
    updatePlayerArea(db, p.id, 'fogne')
    const again = findPlayerBySession(db, seed, p.sessionToken)
    expect(again?.currentAreaId).toBe('fogne')
  })
})
