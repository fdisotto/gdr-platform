import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  createParty, findParty, verifyMaster,
  archiveParty, restoreParty, listPartiesForBrowser,
  countActivePartiesForUser, isMaster, listMasters, touchParty,
  hardDeleteParty, transferMaster
} from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import { createRequest } from '~~/server/services/party-join-requests'
import { insertMessage } from '~~/server/services/messages'
import { parties, players, messages } from '~~/server/db/schema'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let userId: string
beforeEach(async () => {
  db = createTestDb()
  userId = await createApprovedUser(db)
})

describe('parties service', () => {
  it('createParty genera seed uuid, cityName, masterToken in chiaro e master player', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    expect(r.seed).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4/)
    expect(r.masterToken.length).toBeGreaterThan(20)
    expect(r.masterPlayer.role).toBe('master')
    expect(r.masterPlayer.nickname).toBe('Nick')
    expect(r.masterPlayer.currentAreaId).toBe('piazza')
    expect(r.cityState.areas.piazza.status).toBe('intact')
  })

  it('findParty ritrova la party per seed', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    const found = findParty(db, r.seed)
    expect(found?.cityName).toBe(r.cityState.cityName)
  })

  it('verifyMaster accetta solo il token corretto', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    expect(await verifyMaster(db, r.seed, r.masterToken)).toBe(true)
    expect(await verifyMaster(db, r.seed, 'wrong')).toBe(false)
  })

  it('createParty rispetta visibility/joinPolicy passati', async () => {
    const r = await createParty(db, {
      userId, displayName: 'Nick', visibility: 'public', joinPolicy: 'auto'
    })
    const p = findParty(db, r.seed)!
    expect(p.visibility).toBe('public')
    expect(p.joinPolicy).toBe('auto')
  })

  it('createParty default = private + request', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    const p = findParty(db, r.seed)!
    expect(p.visibility).toBe('private')
    expect(p.joinPolicy).toBe('request')
  })

  it('archiveParty / restoreParty toggle archivedAt', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    archiveParty(db, r.seed)
    expect(findParty(db, r.seed)!.archivedAt).not.toBeNull()
    restoreParty(db, r.seed)
    expect(findParty(db, r.seed)!.archivedAt).toBeNull()
  })

  it('isMaster true per il creatore', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    expect(isMaster(db, r.seed, userId)).toBe(true)
    const other = await createApprovedUser(db, 'other')
    expect(isMaster(db, r.seed, other)).toBe(false)
  })

  it('listMasters torna il master attivo', async () => {
    const r = await createParty(db, { userId, displayName: 'Nick' })
    const m = listMasters(db, r.seed)
    expect(m).toHaveLength(1)
    expect(m[0]!.userId).toBe(userId)
    expect(m[0]!.nickname).toBe('Nick')
  })

  it('countActivePartiesForUser conta righe attive distinte', async () => {
    const r1 = await createParty(db, { userId, displayName: 'A' })
    const r2 = await createParty(db, { userId, displayName: 'B' })
    expect(r1.seed).not.toBe(r2.seed)
    expect(countActivePartiesForUser(db, userId)).toBe(2)
  })

  it('listPartiesForBrowser filtra private non-mine', async () => {
    const userB = await createApprovedUser(db, 'b')
    // userId crea una public e una private
    const pub = await createParty(db, {
      userId, displayName: 'Master', visibility: 'public', joinPolicy: 'auto'
    })
    await createParty(db, {
      userId, displayName: 'Master2', visibility: 'private', joinPolicy: 'request'
    })
    // userB vede solo la public
    const page = listPartiesForBrowser(db, { userId: userB })
    expect(page.items.map(i => i.seed)).toEqual([pub.seed])
  })

  it('listPartiesForBrowser filter mine ritorna solo proprie', async () => {
    const userB = await createApprovedUser(db, 'b')
    const pub = await createParty(db, {
      userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto'
    })
    await createParty(db, {
      userId: userB, displayName: 'M2', visibility: 'public', joinPolicy: 'auto'
    })
    const page = listPartiesForBrowser(db, { userId, filters: { mine: true } })
    expect(page.items.map(i => i.seed)).toEqual([pub.seed])
  })

  it('listPartiesForBrowser filter auto lascia solo joinPolicy=auto', async () => {
    const userB = await createApprovedUser(db, 'b')
    const auto = await createParty(db, {
      userId, displayName: 'A', visibility: 'public', joinPolicy: 'auto'
    })
    await createParty(db, {
      userId, displayName: 'B', visibility: 'public', joinPolicy: 'request'
    })
    const page = listPartiesForBrowser(db, { userId: userB, filters: { auto: true } })
    expect(page.items.map(i => i.seed)).toEqual([auto.seed])
  })

  it('listPartiesForBrowser hasPendingRequest true se ha pending', async () => {
    const userB = await createApprovedUser(db, 'b')
    const r = await createParty(db, {
      userId, displayName: 'M', visibility: 'public', joinPolicy: 'request'
    })
    createRequest(db, { partySeed: r.seed, userId: userB, displayName: 'B' })
    const page = listPartiesForBrowser(db, { userId: userB })
    const item = page.items.find(i => i.seed === r.seed)!
    expect(item.hasPendingRequest).toBe(true)
  })

  it('listPartiesForBrowser isMember true se membership', async () => {
    const userB = await createApprovedUser(db, 'b')
    const r = await createParty(db, {
      userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto'
    })
    joinParty(db, r.seed, 'B', { userId: userB })
    const page = listPartiesForBrowser(db, { userId: userB })
    const item = page.items.find(i => i.seed === r.seed)!
    expect(item.isMember).toBe(true)
  })

  it('listPartiesForBrowser esclude archived', async () => {
    const r = await createParty(db, {
      userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto'
    })
    archiveParty(db, r.seed)
    const userB = await createApprovedUser(db, 'b')
    const page = listPartiesForBrowser(db, { userId: userB })
    expect(page.items.map(i => i.seed)).not.toContain(r.seed)
  })

  it('listPartiesForBrowser pagination cursor copre 2 pagine', async () => {
    // Creiamo 3 party public con lastActivityAt scaglionato manualmente
    const seeds: string[] = []
    for (let i = 0; i < 3; i++) {
      const r = await createParty(db, {
        userId, displayName: `M${i}`, visibility: 'public', joinPolicy: 'auto'
      })
      seeds.push(r.seed)
      // forziamo lastActivityAt per avere ordine deterministico
      db.update(parties)
        .set({ lastActivityAt: 1000 + i * 100 })
        .where(eq(parties.seed, r.seed))
        .run()
    }
    void touchParty // import sentinel
    const userB = await createApprovedUser(db, 'b')
    const p1 = listPartiesForBrowser(db, { userId: userB, limit: 2 })
    expect(p1.items).toHaveLength(2)
    expect(p1.nextCursor).not.toBeNull()
    const p2 = listPartiesForBrowser(db, {
      userId: userB, limit: 2, cursor: p1.nextCursor ?? undefined
    })
    expect(p2.items).toHaveLength(1)
    expect(p2.nextCursor).toBeNull()
    // unione = tutti i seed
    const allSeeds = [...p1.items, ...p2.items].map(i => i.seed).sort()
    expect(allSeeds).toEqual(seeds.slice().sort())
  })

  it('listPartiesForBrowser filter withSlots esclude piene', async () => {
    const userB = await createApprovedUser(db, 'b')
    const r = await createParty(db, {
      userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto'
    })
    // sane: solo 1 membro, sopra MAX_MEMBERS_PER_PARTY=30 quindi non piena
    const page = listPartiesForBrowser(db, { userId: userB, filters: { withSlots: true } })
    expect(page.items.map(i => i.seed)).toContain(r.seed)
  })

  it('hardDeleteParty rimuove la party e cascade pulisce le tabelle dipendenti', async () => {
    const r = await createParty(db, { userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto' })
    const userB = await createApprovedUser(db, 'b')
    joinParty(db, r.seed, 'B', { userId: userB })
    insertMessage(db, {
      partySeed: r.seed, kind: 'say', authorDisplay: 'M', areaId: 'piazza', body: 'ciao'
    })
    expect(db.select().from(players).where(eq(players.partySeed, r.seed)).all()).toHaveLength(2)
    expect(db.select().from(messages).where(eq(messages.partySeed, r.seed)).all()).toHaveLength(1)
    hardDeleteParty(db, r.seed)
    expect(findParty(db, r.seed)).toBeNull()
    expect(db.select().from(players).where(eq(players.partySeed, r.seed)).all()).toHaveLength(0)
    expect(db.select().from(messages).where(eq(messages.partySeed, r.seed)).all()).toHaveLength(0)
  })

  it('transferMaster scambia ruoli quando entrambi sono attivi', async () => {
    const r = await createParty(db, { userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto' })
    const userB = await createApprovedUser(db, 'b')
    joinParty(db, r.seed, 'B', { userId: userB })
    transferMaster(db, r.seed, userId, userB)
    expect(isMaster(db, r.seed, userId)).toBe(false)
    expect(isMaster(db, r.seed, userB)).toBe(true)
  })

  it('transferMaster fallisce se from non è master attivo', async () => {
    const r = await createParty(db, { userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto' })
    const userB = await createApprovedUser(db, 'b')
    joinParty(db, r.seed, 'B', { userId: userB })
    expect(() => transferMaster(db, r.seed, userB, userId)).toThrow(/fromUserId not active master/)
  })

  it('transferMaster fallisce se to non è membro attivo', async () => {
    const r = await createParty(db, { userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto' })
    const userB = await createApprovedUser(db, 'b')
    expect(() => transferMaster(db, r.seed, userId, userB)).toThrow(/toUserId not active member/)
  })

  it('transferMaster fallisce se from === to', async () => {
    const r = await createParty(db, { userId, displayName: 'M', visibility: 'public', joinPolicy: 'auto' })
    expect(() => transferMaster(db, r.seed, userId, userId)).toThrow(/===/)
  })

  // v2c: limits.maxPartiesPerUser runtime override
  it('joinParty rispetta limits.maxPartiesPerUser via system_settings', async () => {
    const { setSetting, invalidateCache } = await import('~~/server/services/system-settings')
    invalidateCache()
    setSetting(db, 'limits.maxPartiesPerUser', 1, null)
    // userId ha già 0 party. Crea 1 → ok. Tentativo di joinare a un'altra come userB
    const userB = await createApprovedUser(db, 'b')
    const r1 = await createParty(db, { userId: userB, displayName: 'A', visibility: 'public', joinPolicy: 'auto' })
    const r2 = await createParty(db, { userId: userB, displayName: 'B', visibility: 'public', joinPolicy: 'auto' })
    void r1
    void r2
    // userId prova a joinare la prima
    joinParty(db, r1.seed, 'X', { userId })
    // ora userId ha 1 party attiva → join in r2 deve fallire con party_limit
    expect(() => joinParty(db, r2.seed, 'Y', { userId })).toThrow(/party_limit|max 1/)
    invalidateCache()
  })
})
