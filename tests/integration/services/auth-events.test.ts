import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  logAuthEvent, listAuthEvents, listAuthEventsByActor
} from '~~/server/services/auth-events'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

describe('auth-events service', () => {
  it('logAuthEvent persiste una riga con id auto-generato', () => {
    logAuthEvent(db, {
      actorKind: 'user',
      actorId: 'u-1',
      event: 'login',
      ip: '1.1.1.1',
      userAgent: 'UA',
      detail: 'ok'
    })
    const rows = listAuthEvents(db)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.actorKind).toBe('user')
    expect(rows[0]!.actorId).toBe('u-1')
    expect(rows[0]!.event).toBe('login')
    expect(rows[0]!.ip).toBe('1.1.1.1')
    expect(rows[0]!.userAgent).toBe('UA')
    expect(rows[0]!.detail).toBe('ok')
    expect(rows[0]!.id).toBeTruthy()
    expect(rows[0]!.createdAt).toBeGreaterThan(0)
  })

  it('supporta actor anonymous con usernameAttempted', () => {
    logAuthEvent(db, {
      actorKind: 'anonymous',
      usernameAttempted: 'foo',
      event: 'login_failed'
    })
    const rows = listAuthEvents(db)
    expect(rows[0]!.actorKind).toBe('anonymous')
    expect(rows[0]!.actorId).toBeNull()
    expect(rows[0]!.usernameAttempted).toBe('foo')
  })

  it('listAuthEvents ritorna le righe in ordine desc di createdAt', async () => {
    logAuthEvent(db, { actorKind: 'user', actorId: 'u', event: 'login' })
    // sleep breve per garantire createdAt diverso
    await new Promise(r => setTimeout(r, 5))
    logAuthEvent(db, { actorKind: 'user', actorId: 'u', event: 'logout' })
    const rows = listAuthEvents(db)
    expect(rows).toHaveLength(2)
    expect(rows[0]!.event).toBe('logout')
    expect(rows[1]!.event).toBe('login')
    expect(rows[0]!.createdAt).toBeGreaterThanOrEqual(rows[1]!.createdAt)
  })

  it('listAuthEvents rispetta il limit', () => {
    for (let i = 0; i < 5; i++) {
      logAuthEvent(db, { actorKind: 'user', actorId: 'u', event: 'login' })
    }
    expect(listAuthEvents(db, 3)).toHaveLength(3)
  })

  it('listAuthEventsByActor filtra per actorKind + actorId', () => {
    logAuthEvent(db, { actorKind: 'user', actorId: 'u-1', event: 'login' })
    logAuthEvent(db, { actorKind: 'user', actorId: 'u-2', event: 'login' })
    logAuthEvent(db, { actorKind: 'superadmin', actorId: 'sa-1', event: 'login' })
    expect(listAuthEventsByActor(db, 'user', 'u-1')).toHaveLength(1)
    expect(listAuthEventsByActor(db, 'user', 'u-2')).toHaveLength(1)
    expect(listAuthEventsByActor(db, 'superadmin', 'sa-1')).toHaveLength(1)
    expect(listAuthEventsByActor(db, 'user', 'sa-1')).toHaveLength(0)
  })
})
