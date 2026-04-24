import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import { insertMessage, listRecentDmsForPlayer } from '~~/server/services/messages'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterId: string
let annaId: string
let lucaId: string

beforeEach(async () => {
  db = createTestDb()
  const masterUserId = await createApprovedUser(db, 'master-dm')
  const annaUserId = await createApprovedUser(db, 'anna-dm')
  const lucaUserId = await createApprovedUser(db, 'luca-dm')
  const r = await createParty(db, { userId: masterUserId, displayName: 'M' })
  seed = r.seed
  masterId = r.masterPlayer.id
  annaId = joinParty(db, seed, 'Anna', { userId: annaUserId }).id
  lucaId = joinParty(db, seed, 'Luca', { userId: lucaUserId }).id
})

describe('listRecentDmsForPlayer', () => {
  it('ritorna DM dove il player è author o target', () => {
    insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: masterId, authorDisplay: 'M', areaId: null, targetPlayerId: annaId, body: 'a' })
    insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: annaId, authorDisplay: 'Anna', areaId: null, targetPlayerId: masterId, body: 'b' })
    insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: masterId, authorDisplay: 'M', areaId: null, targetPlayerId: lucaId, body: 'c' })
    // Anna vede solo i due che la coinvolgono
    const result = listRecentDmsForPlayer(db, seed, annaId, 50)
    expect(result).toHaveLength(2)
    expect(result.map(m => m.body).sort()).toEqual(['a', 'b'])
  })

  it('esclude messaggi non-dm', () => {
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: annaId, authorDisplay: 'Anna', areaId: 'piazza', body: 'ciao' })
    insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: annaId, authorDisplay: 'Anna', areaId: null, targetPlayerId: masterId, body: 'privato' })
    const result = listRecentDmsForPlayer(db, seed, annaId, 50)
    expect(result).toHaveLength(1)
    expect(result[0]!.body).toBe('privato')
  })

  it('limita agli ultimi N', async () => {
    for (let i = 0; i < 60; i++) {
      insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: annaId, authorDisplay: 'Anna', areaId: null, targetPlayerId: masterId, body: `m${i}` })
      if (i % 10 === 0) await new Promise<void>(r => setTimeout(r, 2))
    }
    const result = listRecentDmsForPlayer(db, seed, annaId, 50)
    expect(result).toHaveLength(50)
    // Gli ultimi 50 sono m10..m59
    expect(result[0]!.body).toBe('m10')
    expect(result[49]!.body).toBe('m59')
  })
})
