import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  insertUser, findUserByUsername, findUserById,
  approveUser, banUser, listUsersByStatus, rejectUser,
  markMustReset, updatePassword
} from '~~/server/services/users'
import { hashPassword } from '~~/server/services/auth'
import { generateUuid } from '~~/server/utils/crypto'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

async function fakeUser(overrides: Partial<{ username: string, password: string, id: string }> = {}) {
  const hash = await hashPassword(overrides.password ?? 'secret12')
  return insertUser(db, {
    id: overrides.id ?? generateUuid(),
    username: overrides.username ?? 'TestUser',
    passwordHash: hash
  })
}

describe('users service', () => {
  it('insertUser crea un record pending con username lowercased', async () => {
    const u = await fakeUser({ username: 'Mash' })
    expect(u.status).toBe('pending')
    expect(u.username).toBe('Mash')
    expect(u.usernameLower).toBe('mash')
    expect(u.mustReset).toBe(false)
    expect(u.approvedAt).toBeNull()
  })

  it('findUserByUsername è case-insensitive e ritorna row', async () => {
    await fakeUser({ username: 'Mash' })
    expect(findUserByUsername(db, 'MASH')?.username).toBe('Mash')
    expect(findUserByUsername(db, 'mash')?.username).toBe('Mash')
    expect(findUserByUsername(db, 'altro')).toBeNull()
  })

  it('rifiuta username duplicato case-insensitive', async () => {
    await fakeUser({ username: 'Mash' })
    await expect(fakeUser({ username: 'MASH' })).rejects.toThrow()
  })

  it('approveUser transita pending → approved', async () => {
    const u = await fakeUser()
    approveUser(db, u.id, 'sa-1')
    const r = findUserById(db, u.id)
    expect(r?.status).toBe('approved')
    expect(r?.approvedBy).toBe('sa-1')
    expect(r?.approvedAt).not.toBeNull()
  })

  it('banUser imposta status=banned con reason', async () => {
    const u = await fakeUser()
    approveUser(db, u.id, 'sa-1')
    banUser(db, u.id, 'spam')
    const r = findUserById(db, u.id)
    expect(r?.status).toBe('banned')
    expect(r?.bannedReason).toBe('spam')
  })

  it('listUsersByStatus filtra correttamente', async () => {
    await fakeUser({ username: 'A' })
    const u2 = await fakeUser({ username: 'B' })
    approveUser(db, u2.id, 'sa')
    expect(listUsersByStatus(db, 'pending')).toHaveLength(1)
    expect(listUsersByStatus(db, 'approved')).toHaveLength(1)
    expect(listUsersByStatus(db, 'banned')).toHaveLength(0)
  })

  it('rejectUser elimina solo pending', async () => {
    const u = await fakeUser()
    rejectUser(db, u.id)
    expect(findUserById(db, u.id)).toBeNull()
  })

  it('rejectUser NO-OP se user già approved', async () => {
    const u = await fakeUser()
    approveUser(db, u.id, 'sa')
    rejectUser(db, u.id)
    expect(findUserById(db, u.id)?.status).toBe('approved')
  })

  it('markMustReset + updatePassword flow', async () => {
    const u = await fakeUser()
    markMustReset(db, u.id, true)
    expect(findUserById(db, u.id)?.mustReset).toBe(true)
    const newHash = await hashPassword('newsecret12')
    updatePassword(db, u.id, newHash)
    const r = findUserById(db, u.id)
    expect(r?.passwordHash).toBe(newHash)
    expect(r?.mustReset).toBe(false)
  })
})
