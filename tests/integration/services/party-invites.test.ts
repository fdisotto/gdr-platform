import { describe, it, expect, beforeEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { partyInvites } from '~~/server/db/schema'
import {
  createInvite, listInvites, findActiveByToken,
  consumeInvite, revokeInvite
} from '~~/server/services/party-invites'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterUserId: string
let userBId: string

beforeEach(async () => {
  db = createTestDb()
  masterUserId = await createApprovedUser(db, 'master')
  userBId = await createApprovedUser(db, 'userb')
  const r = await createParty(db, { userId: masterUserId, displayName: 'Master' })
  seed = r.seed
})

describe('party-invites service', () => {
  it('createInvite genera token unico, expiresAt = now + 7d', () => {
    const before = Date.now()
    const inv = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    const after = Date.now()
    expect(inv.token).toMatch(/^[A-Za-z0-9_-]{30,}$/)
    expect(inv.partySeed).toBe(seed)
    expect(inv.createdBy).toBe(masterUserId)
    expect(inv.usedAt).toBeNull()
    expect(inv.revokedAt).toBeNull()
    const expectedMin = before + 7 * 86400_000
    const expectedMax = after + 7 * 86400_000
    expect(inv.expiresAt).toBeGreaterThanOrEqual(expectedMin)
    expect(inv.expiresAt).toBeLessThanOrEqual(expectedMax)
  })

  it('listInvites ritorna tutti gli invite anche scaduti/usati/revocati', () => {
    const a = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    const b = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    revokeInvite(db, b.id)
    const list = listInvites(db, seed)
    expect(list.map(i => i.id).sort()).toEqual([a.id, b.id].sort())
  })

  it('findActiveByToken filtra usedAt, revokedAt, expiresAt', () => {
    const inv = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    expect(findActiveByToken(db, inv.token)?.id).toBe(inv.id)
    consumeInvite(db, inv.id, userBId)
    expect(findActiveByToken(db, inv.token)).toBeNull()
  })

  it('findActiveByToken null su token sconosciuto', () => {
    expect(findActiveByToken(db, 'unknown')).toBeNull()
  })

  it('findActiveByToken null se revocato', () => {
    const inv = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    revokeInvite(db, inv.id)
    expect(findActiveByToken(db, inv.token)).toBeNull()
  })

  it('findActiveByToken null se scaduto (manipolato in DB)', () => {
    const inv = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    db.update(partyInvites)
      .set({ expiresAt: Date.now() - 1000 })
      .where(eq(partyInvites.id, inv.id))
      .run()
    expect(findActiveByToken(db, inv.token)).toBeNull()
  })

  it('consumeInvite setta usedAt e usedBy', () => {
    const inv = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    consumeInvite(db, inv.id, userBId)
    const list = listInvites(db, seed)
    const after = list.find(i => i.id === inv.id)!
    expect(after.usedAt).not.toBeNull()
    expect(after.usedBy).toBe(userBId)
  })

  it('revokeInvite setta revokedAt e blocca uso futuro', () => {
    const inv = createInvite(db, { partySeed: seed, createdBy: masterUserId })
    revokeInvite(db, inv.id)
    expect(findActiveByToken(db, inv.token)).toBeNull()
    const list = listInvites(db, seed)
    const after = list.find(i => i.id === inv.id)!
    expect(after.revokedAt).not.toBeNull()
  })
})
