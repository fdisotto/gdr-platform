import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import {
  createRequest, listRequests, findRequest,
  approveRequest, rejectRequest, cancelRequest
} from '~~/server/services/party-join-requests'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterUserId: string
let userBId: string
let userCId: string

beforeEach(async () => {
  db = createTestDb()
  masterUserId = await createApprovedUser(db, 'master')
  userBId = await createApprovedUser(db, 'userb')
  userCId = await createApprovedUser(db, 'userc')
  const r = await createParty(db, { userId: masterUserId, displayName: 'Master' })
  seed = r.seed
})

describe('party-join-requests service', () => {
  it('createRequest crea pending con displayName e message', () => {
    const req = createRequest(db, {
      partySeed: seed, userId: userBId, displayName: 'Bob', message: 'ciao'
    })
    expect(req.status).toBe('pending')
    expect(req.displayName).toBe('Bob')
    expect(req.message).toBe('ciao')
    expect(req.resolvedAt).toBeNull()
  })

  it('createRequest dedupe: 2 pending stesso (party,user) → conflict', () => {
    createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob' })
    expect(() =>
      createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bobby' })
    ).toThrowError(/conflict/)
  })

  it('createRequest permesso dopo che la pending precedente è stata cancelled', () => {
    const r1 = createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob' })
    cancelRequest(db, r1.id, userBId)
    // ora deve essere ammesso
    const r2 = createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob2' })
    expect(r2.status).toBe('pending')
  })

  it('listRequests filtra di default su pending', () => {
    const r1 = createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob' })
    createRequest(db, { partySeed: seed, userId: userCId, displayName: 'Carla' })
    rejectRequest(db, r1.id, masterUserId, 'no')
    const pending = listRequests(db, seed)
    expect(pending).toHaveLength(1)
    expect(pending[0]!.userId).toBe(userCId)
  })

  it('approveRequest setta status, resolvedAt, resolvedBy', () => {
    const r = createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob' })
    approveRequest(db, r.id, masterUserId)
    const after = findRequest(db, r.id)!
    expect(after.status).toBe('approved')
    expect(after.resolvedBy).toBe(masterUserId)
    expect(after.resolvedAt).not.toBeNull()
  })

  it('rejectRequest salva reason', () => {
    const r = createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob' })
    rejectRequest(db, r.id, masterUserId, 'pieno')
    const after = findRequest(db, r.id)!
    expect(after.status).toBe('rejected')
    expect(after.rejectReason).toBe('pieno')
  })

  it('cancelRequest funziona solo se status=pending e self', () => {
    const r = createRequest(db, { partySeed: seed, userId: userBId, displayName: 'Bob' })
    // utente diverso non può cancellare
    expect(() => cancelRequest(db, r.id, userCId)).toThrowError(/forbidden/)
    cancelRequest(db, r.id, userBId)
    const after = findRequest(db, r.id)!
    expect(after.status).toBe('cancelled')
    // doppio cancel su non pending → forbidden
    expect(() => cancelRequest(db, r.id, userBId)).toThrowError(/forbidden/)
  })

  it('findRequest null se id sconosciuto', () => {
    expect(findRequest(db, 'nope')).toBeNull()
  })
})
