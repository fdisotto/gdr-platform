import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  insertSuperadmin, findSuperadminByUsername, findSuperadminById,
  listSuperadmins, updatePassword, markMustReset, seedDefaultSuperadmin
} from '~~/server/services/superadmins'
import { hashPassword, verifyPassword } from '~~/server/services/auth'
import { generateUuid } from '~~/server/utils/crypto'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

async function fakeSa(overrides: Partial<{ username: string, password: string, id: string, mustReset: boolean }> = {}) {
  const hash = await hashPassword(overrides.password ?? 'secret12')
  return insertSuperadmin(db, {
    id: overrides.id ?? generateUuid(),
    username: overrides.username ?? 'Root',
    passwordHash: hash,
    mustReset: overrides.mustReset
  })
}

describe('superadmins service', () => {
  it('insertSuperadmin crea record con usernameLower e mustReset=false di default', async () => {
    const sa = await fakeSa({ username: 'Root' })
    expect(sa.username).toBe('Root')
    expect(sa.usernameLower).toBe('root')
    expect(sa.mustReset).toBe(false)
    expect(sa.createdAt).toBeGreaterThan(0)
  })

  it('insertSuperadmin accetta mustReset esplicito', async () => {
    const sa = await fakeSa({ mustReset: true })
    expect(sa.mustReset).toBe(true)
  })

  it('findSuperadminByUsername è case-insensitive', async () => {
    await fakeSa({ username: 'Root' })
    expect(findSuperadminByUsername(db, 'ROOT')?.username).toBe('Root')
    expect(findSuperadminByUsername(db, 'root')?.username).toBe('Root')
    expect(findSuperadminByUsername(db, 'altro')).toBeNull()
  })

  it('findSuperadminById ritorna la riga giusta', async () => {
    const sa = await fakeSa()
    expect(findSuperadminById(db, sa.id)?.username).toBe(sa.username)
    expect(findSuperadminById(db, 'no-such-id')).toBeNull()
  })

  it('rifiuta duplicate username case-insensitive', async () => {
    await fakeSa({ username: 'Root' })
    await expect(fakeSa({ username: 'ROOT' })).rejects.toThrow()
  })

  it('listSuperadmins ritorna tutte le righe', async () => {
    await fakeSa({ username: 'a' })
    await fakeSa({ username: 'b' })
    expect(listSuperadmins(db)).toHaveLength(2)
  })

  it('updatePassword aggiorna hash e azzera mustReset', async () => {
    const sa = await fakeSa({ mustReset: true })
    const newHash = await hashPassword('newsecret12')
    updatePassword(db, sa.id, newHash)
    const r = findSuperadminById(db, sa.id)
    expect(r?.passwordHash).toBe(newHash)
    expect(r?.mustReset).toBe(false)
  })

  it('markMustReset aggiorna il flag', async () => {
    const sa = await fakeSa()
    markMustReset(db, sa.id, true)
    expect(findSuperadminById(db, sa.id)?.mustReset).toBe(true)
    markMustReset(db, sa.id, false)
    expect(findSuperadminById(db, sa.id)?.mustReset).toBe(false)
  })

  it('seedDefaultSuperadmin inserisce admin/changeme con mustReset=true se tabella vuota', async () => {
    const inserted = await seedDefaultSuperadmin(db)
    expect(inserted).toBe(true)
    const rows = listSuperadmins(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.username).toBe('admin')
    expect(rows[0]!.mustReset).toBe(true)
    expect(await verifyPassword('changeme', rows[0]!.passwordHash)).toBe(true)
  })

  it('seedDefaultSuperadmin è idempotente: no-op se già presente', async () => {
    const first = await seedDefaultSuperadmin(db)
    const second = await seedDefaultSuperadmin(db)
    expect(first).toBe(true)
    expect(second).toBe(false)
    expect(listSuperadmins(db)).toHaveLength(1)
  })
})
