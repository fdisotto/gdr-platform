import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import {
  joinParty, findPlayerBySession, findPlayerByNickname,
  isBanned, listOnlinePlayers, touchPlayer
} from '~~/server/services/players'
import { bans } from '~~/server/db/schema'

let db: Db
let seed: string

beforeEach(async () => {
  db = createTestDb()
  const r = await createParty(db, { masterNickname: 'Master' })
  seed = r.seed
})

describe('players service', () => {
  it('joinParty crea player nell area piazza', () => {
    const p = joinParty(db, seed, 'Anna')
    expect(p.role).toBe('user')
    expect(p.currentAreaId).toBe('piazza')
    expect(p.sessionToken.length).toBeGreaterThan(10)
  })

  it('joinParty rifiuta nickname già usato (conflict)', () => {
    joinParty(db, seed, 'Anna')
    expect(() => joinParty(db, seed, 'Anna')).toThrowError(/conflict/)
  })

  it('joinParty rifiuta se party inesistente', () => {
    expect(() => joinParty(db, 'not-exist', 'Anna')).toThrowError(/not_found/)
  })

  it('joinParty rifiuta nickname bannato', () => {
    db.insert(bans).values({
      partySeed: seed, nicknameLower: 'anna', reason: null, bannedAt: Date.now()
    }).run()
    expect(() => joinParty(db, seed, 'Anna')).toThrowError(/banned/)
  })

  it('findPlayerBySession trova il player', () => {
    const p = joinParty(db, seed, 'Anna')
    const f = findPlayerBySession(db, seed, p.sessionToken)
    expect(f?.id).toBe(p.id)
  })

  it('findPlayerByNickname case-insensitive', () => {
    joinParty(db, seed, 'Anna')
    expect(findPlayerByNickname(db, seed, 'anna')?.nickname).toBe('Anna')
    expect(findPlayerByNickname(db, seed, 'ANNA')?.nickname).toBe('Anna')
  })

  it('listOnlinePlayers include il master iniziale e i nuovi', () => {
    joinParty(db, seed, 'Anna')
    joinParty(db, seed, 'Luca')
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
    const p = joinParty(db, seed, 'Anna')
    const before = p.lastSeenAt
    const later = before + 1000
    touchPlayer(db, p.id, later)
    const again = findPlayerBySession(db, seed, p.sessionToken)
    expect(again?.lastSeenAt).toBe(later)
  })
})
