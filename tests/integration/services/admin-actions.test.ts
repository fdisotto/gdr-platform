import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  logAdminAction, listAdminActions, listAdminActionsByActor
} from '~~/server/services/admin-actions'
import { insertSuperadmin } from '~~/server/services/superadmins'
import { hashPassword } from '~~/server/services/auth'
import { generateUuid } from '~~/server/utils/crypto'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

async function fakeSa(username = 'root') {
  const hash = await hashPassword('secret12')
  return insertSuperadmin(db, {
    id: generateUuid(),
    username,
    passwordHash: hash
  })
}

describe('admin-actions service', () => {
  it('logAdminAction inserisce riga con id auto, createdAt e payload serializzato', async () => {
    const sa = await fakeSa('root')
    logAdminAction(db, {
      superadminId: sa.id,
      action: 'party.archive',
      targetKind: 'party',
      targetId: 'seed-1',
      payload: { reason: 'idle' }
    })
    const items = listAdminActions(db, {})
    expect(items).toHaveLength(1)
    expect(items[0]!.action).toBe('party.archive')
    expect(items[0]!.targetKind).toBe('party')
    expect(items[0]!.targetId).toBe('seed-1')
    expect(items[0]!.payload).toEqual({ reason: 'idle' })
    expect(items[0]!.id).toBeTruthy()
    expect(items[0]!.createdAt).toBeGreaterThan(0)
  })

  it('logAdminAction accetta target/payload assenti', async () => {
    const sa = await fakeSa('root')
    logAdminAction(db, { superadminId: sa.id, action: 'maintenance.enable' })
    const items = listAdminActions(db, {})
    expect(items[0]!.targetKind).toBeNull()
    expect(items[0]!.targetId).toBeNull()
    expect(items[0]!.payload).toBeNull()
  })

  it('listAdminActions ritorna ordine desc per createdAt e applica limit', async () => {
    const sa = await fakeSa('root')
    for (let i = 0; i < 5; i++) {
      logAdminAction(db, {
        superadminId: sa.id, action: 'setting.update', payload: { i }
      })
      // micro-pausa per garantire timestamp distinguibili
      await new Promise(r => setTimeout(r, 2))
    }
    const items = listAdminActions(db, { limit: 3 })
    expect(items).toHaveLength(3)
    for (let i = 1; i < items.length; i++) {
      expect(items[i]!.createdAt).toBeLessThanOrEqual(items[i - 1]!.createdAt)
    }
  })

  it('listAdminActions con cursor before filtra createdAt strettamente minore', async () => {
    const sa = await fakeSa('root')
    logAdminAction(db, { superadminId: sa.id, action: 'party.edit' })
    await new Promise(r => setTimeout(r, 5))
    logAdminAction(db, { superadminId: sa.id, action: 'party.archive' })
    const all = listAdminActions(db, {})
    expect(all).toHaveLength(2)
    const cursor = all[0]!.createdAt
    const older = listAdminActions(db, { before: cursor })
    expect(older).toHaveLength(1)
    expect(older[0]!.action).toBe('party.edit')
  })

  it('listAdminActionsByActor filtra per superadmin', async () => {
    const sa1 = await fakeSa('root1')
    const sa2 = await fakeSa('root2')
    logAdminAction(db, { superadminId: sa1.id, action: 'party.edit' })
    logAdminAction(db, { superadminId: sa2.id, action: 'admin.elevate' })
    logAdminAction(db, { superadminId: sa1.id, action: 'party.archive' })
    const r1 = listAdminActionsByActor(db, sa1.id)
    expect(r1).toHaveLength(2)
    expect(r1.map(a => a.action).sort()).toEqual(['party.archive', 'party.edit'])
    const r2 = listAdminActionsByActor(db, sa2.id)
    expect(r2).toHaveLength(1)
    expect(r2[0]!.action).toBe('admin.elevate')
  })
})
