import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { joinParty } from '~~/server/services/players'
import {
  insertMessage, listAreaMessages, softDeleteMessage, editMessage
} from '~~/server/services/messages'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterId: string

beforeEach(async () => {
  db = createTestDb()
  const masterUserId = await createApprovedUser(db, 'master-msg')
  const r = await createParty(db, { userId: masterUserId, displayName: 'M' })
  seed = r.seed
  masterId = r.masterPlayer.id
})

describe('messages service', () => {
  it('insertMessage persiste e ritorna row completa', () => {
    const msg = insertMessage(db, {
      partySeed: seed,
      kind: 'say',
      authorPlayerId: masterId,
      authorDisplay: 'M',
      areaId: 'piazza',
      body: 'ciao'
    })
    expect(msg.id).toBeTruthy()
    expect(msg.createdAt).toBeGreaterThan(0)
    expect(msg.body).toBe('ciao')
  })

  it('listAreaMessages ritorna in ordine cronologico', () => {
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'uno' })
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'due' })
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.body).toBe('uno')
    expect(rows[1]!.body).toBe('due')
  })

  it('listAreaMessages limita', () => {
    for (let i = 0; i < 5; i++) {
      insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: `m${i}` })
    }
    const rows = listAreaMessages(db, seed, 'piazza', 3)
    expect(rows).toHaveLength(3)
  })

  it('listAreaMessages esclude aree diverse', () => {
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'qui' })
    insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'fogne', body: 'altrove' })
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.body).toBe('qui')
  })

  it('softDeleteMessage marca deletedAt e deletedBy', () => {
    const msg = insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'x' })
    softDeleteMessage(db, msg.id, masterId)
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows[0]!.deletedAt).not.toBeNull()
    expect(rows[0]!.deletedBy).toBe(masterId)
  })

  it('editMessage aggiorna body e editedAt', () => {
    const msg = insertMessage(db, { partySeed: seed, kind: 'say', authorPlayerId: masterId, authorDisplay: 'M', areaId: 'piazza', body: 'old' })
    editMessage(db, msg.id, 'new')
    const rows = listAreaMessages(db, seed, 'piazza', 10)
    expect(rows[0]!.body).toBe('new')
    expect(rows[0]!.editedAt).not.toBeNull()
  })

  it('insertMessage con kind=dm usa targetPlayerId e areaId null', async () => {
    const annaUserId = await createApprovedUser(db, 'anna-msg')
    const other = joinParty(db, seed, 'Anna', { userId: annaUserId })
    const msg = insertMessage(db, {
      partySeed: seed, kind: 'dm', authorPlayerId: masterId, authorDisplay: 'M',
      areaId: null, targetPlayerId: other.id, body: 'ciao anna'
    })
    expect(msg.areaId).toBeNull()
    expect(msg.targetPlayerId).toBe(other.id)
  })
})
