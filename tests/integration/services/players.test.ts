import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty, listMasters } from '~~/server/services/parties'
import {
  joinParty, findPlayerBySession, findPlayerByNickname,
  isBanned, listOnlinePlayers, touchPlayer, updatePlayerArea,
  leaveParty, promoteToMaster, demoteFromMaster, findPlayerByUserInParty
} from '~~/server/services/players'
import { bans, players } from '~~/server/db/schema'
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

  it('joinParty rejoin via UPDATE preserva id storico (per messaggi)', async () => {
    const p1 = joinParty(db, seed, 'Anna', { userId: annaUserId })
    leaveParty(db, seed, annaUserId)
    const p2 = joinParty(db, seed, 'Annetta', { userId: annaUserId })
    expect(p2.id).toBe(p1.id)
    expect(p2.nickname).toBe('Annetta')
    expect(p2.sessionToken).not.toBe(p1.sessionToken)
  })

  it('findPlayerByUserInParty filtra leftAt', () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    expect(findPlayerByUserInParty(db, seed, annaUserId)).not.toBeNull()
    leaveParty(db, seed, annaUserId)
    expect(findPlayerByUserInParty(db, seed, annaUserId)).toBeNull()
  })

  it('leaveParty soft-delete imposta leftAt', () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    leaveParty(db, seed, annaUserId)
    const row = db.select().from(players)
      .where(eq(players.userId, annaUserId)).all()[0]!
    expect(row.leftAt).not.toBeNull()
  })

  it('leaveParty su ultimo master → last_master', () => {
    expect(() => leaveParty(db, seed, masterUserId)).toThrowError(/last_master/)
  })

  it('leaveParty del master se c è un altro master ok', async () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    promoteToMaster(db, seed, annaUserId, masterUserId)
    leaveParty(db, seed, masterUserId)
    const masters = listMasters(db, seed)
    expect(masters).toHaveLength(1)
    expect(masters[0]!.userId).toBe(annaUserId)
  })

  it('leaveParty non-membro → not_found', async () => {
    const lone = await createApprovedUser(db, 'lone')
    expect(() => leaveParty(db, seed, lone)).toThrowError(/not_found/)
  })

  it('promoteToMaster cambia role e logga audit', () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    promoteToMaster(db, seed, annaUserId, masterUserId)
    const masters = listMasters(db, seed)
    expect(masters.map(m => m.userId).sort()).toEqual([masterUserId, annaUserId].sort())
  })

  it('demoteFromMaster blocca se ultimo master', () => {
    expect(() => demoteFromMaster(db, seed, masterUserId, masterUserId))
      .toThrowError(/last_master/)
  })

  it('demoteFromMaster ok con ≥2 master', () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    promoteToMaster(db, seed, annaUserId, masterUserId)
    demoteFromMaster(db, seed, annaUserId, masterUserId)
    const masters = listMasters(db, seed)
    expect(masters.map(m => m.userId)).toEqual([masterUserId])
  })

  it('demoteFromMaster su user non-master → conflict', () => {
    joinParty(db, seed, 'Anna', { userId: annaUserId })
    expect(() => demoteFromMaster(db, seed, annaUserId, masterUserId))
      .toThrowError(/conflict/)
  })

  it('joinParty rispetta MAX_MEMBERS_PER_PARTY (member_limit)', async () => {
    // Riempiamo la party con 30 membri (master + 29 user). Il 30° join è ok,
    // il 31° fallisce. bcrypt cost 8 nei test rende createApprovedUser lento;
    // serve un timeout esplicito.
    for (let i = 0; i < 29; i++) {
      const u = await createApprovedUser(db, `m${i}`)
      joinParty(db, seed, `M${i}`, { userId: u })
    }
    const overflow = await createApprovedUser(db, 'overflow')
    expect(() => joinParty(db, seed, 'Over', { userId: overflow }))
      .toThrowError(/member_limit/)
  }, 30_000)

  it('joinParty rispetta MAX_PARTIES_PER_USER (party_limit)', async () => {
    // L'utente è già master in `seed`. Crea altre 4 party (totale 5 attive).
    // La 6ª deve fallire al join.
    const seeds: string[] = []
    for (let i = 0; i < 4; i++) {
      const r = await createParty(db, { userId: masterUserId, displayName: `M${i}` })
      seeds.push(r.seed)
    }
    void seeds
    // 5ª party (oltre la prima del beforeEach + 4 nuove) come ulteriore master
    const extra = await createParty(db, { userId: masterUserId, displayName: 'Mx' })
    void extra
    // Ora masterUserId ha 6 party come master attivo. Validiamo che il limit
    // scatti già al 6° createParty? No — createParty non controlla limit
    // (lo fa l'endpoint). Il service joinParty sì, lo testiamo creando un
    // 7° party con altro user e provando a far joinare master.
    const otherUser = await createApprovedUser(db, 'other')
    const target = await createParty(db, { userId: otherUser, displayName: 'Target' })
    expect(() => joinParty(db, target.seed, 'X', { userId: masterUserId }))
      .toThrowError(/party_limit/)
  })
})
