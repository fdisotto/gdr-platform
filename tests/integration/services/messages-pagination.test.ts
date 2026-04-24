import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import {
  insertMessage, listAreaMessagesBefore, listThreadMessagesBefore
} from '~~/server/services/messages'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterId: string
let annaId: string
let lucaId: string

beforeEach(async () => {
  db = createTestDb()
  const masterUserId = await createApprovedUser(db, 'master-pg')
  const annaUserId = await createApprovedUser(db, 'anna-pg')
  const lucaUserId = await createApprovedUser(db, 'luca-pg')
  const r = await createParty(db, { userId: masterUserId, displayName: 'M' })
  seed = r.seed
  masterId = r.masterPlayer.id
  annaId = joinParty(db, seed, 'Anna', { userId: annaUserId }).id
  lucaId = joinParty(db, seed, 'Luca', { userId: lucaUserId }).id
})

describe('listAreaMessagesBefore', () => {
  it('ritorna solo messaggi più vecchi di before, ordinati asc', async () => {
    // Inseriamo 5 messaggi in piazza con un piccolo delay per differenziare timestamp
    const ids: string[] = []
    for (let i = 0; i < 5; i++) {
      const m = insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: `m${i}` })
      ids.push(m.id)
      await new Promise<void>(r => setTimeout(r, 2))
    }
    const later = Date.now() + 10
    const firstBatch = listAreaMessagesBefore(db, seed, 'piazza', later, 3)
    expect(firstBatch).toHaveLength(3)
    // Prendiamo gli ultimi 3 in ordine cronologico
    expect(firstBatch[0]!.body).toBe('m2')
    expect(firstBatch[1]!.body).toBe('m3')
    expect(firstBatch[2]!.body).toBe('m4')

    // Paginazione: usa il più vecchio del batch corrente come nuovo before
    const olderCutoff = firstBatch[0]!.createdAt
    const secondBatch = listAreaMessagesBefore(db, seed, 'piazza', olderCutoff, 3)
    expect(secondBatch.map(m => m.body)).toEqual(['m0', 'm1'])
  })
})

describe('listThreadMessagesBefore', () => {
  it('filtra per coppia + before + limite', async () => {
    // DM tra anna e luca
    for (let i = 0; i < 4; i++) {
      insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: annaId, authorDisplay: 'Anna', areaId: null, targetPlayerId: lucaId, body: `a->l ${i}` })
      await new Promise<void>(r => setTimeout(r, 2))
    }
    // Un DM indipendente tra master e anna
    insertMessage(db, { partySeed: seed, kind: 'dm', authorPlayerId: masterId, authorDisplay: 'M', areaId: null, targetPlayerId: annaId, body: 'altra' })

    const later = Date.now() + 10
    const rows = listThreadMessagesBefore(db, seed, annaId, lucaId, later, 10)
    expect(rows).toHaveLength(4)
    expect(rows.map(m => m.body)).toEqual(['a->l 0', 'a->l 1', 'a->l 2', 'a->l 3'])
  })
})
