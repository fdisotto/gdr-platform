import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import {
  createSession, findSession, extendSession,
  revokeSession, revokeAllForUser, revokeAllForSuperadmin,
  cleanupExpiredSessions,
  SESSION_TTL_MS, SESSION_EXTEND_THRESHOLD_MS
} from '~~/server/services/sessions'
import { insertUser } from '~~/server/services/users'
import { insertSuperadmin } from '~~/server/services/superadmins'
import { generateSessionToken } from '~~/server/services/auth'
import { generateUuid } from '~~/server/utils/crypto'

let db: Db
beforeEach(() => {
  db = createTestDb()
})

function makeUser(username = 'U') {
  return insertUser(db, { id: generateUuid(), username, passwordHash: 'h' })
}
function makeSa(username = 'root') {
  return insertSuperadmin(db, { id: generateUuid(), username, passwordHash: 'h' })
}

describe('sessions service', () => {
  it('createSession per user popola i campi e imposta expiresAt=now+TTL', () => {
    const u = makeUser()
    const now = 1_000_000
    const s = createSession(db, { token: generateSessionToken(), userId: u.id, ip: '1.1.1.1', userAgent: 'UA', now })
    expect(s.userId).toBe(u.id)
    expect(s.superadminId).toBeNull()
    expect(s.createdAt).toBe(now)
    expect(s.lastActivityAt).toBe(now)
    expect(s.expiresAt).toBe(now + SESSION_TTL_MS)
    expect(s.ip).toBe('1.1.1.1')
    expect(s.userAgent).toBe('UA')
  })

  it('createSession per superadmin popola superadminId e lascia userId null', () => {
    const sa = makeSa()
    const s = createSession(db, { token: generateSessionToken(), superadminId: sa.id })
    expect(s.superadminId).toBe(sa.id)
    expect(s.userId).toBeNull()
  })

  it('findSession ritorna row valida non scaduta', () => {
    const u = makeUser()
    const tok = generateSessionToken()
    createSession(db, { token: tok, userId: u.id })
    const r = findSession(db, tok)
    expect(r?.token).toBe(tok)
    expect(r?.userId).toBe(u.id)
  })

  it('findSession ritorna null se sessione scaduta', () => {
    const u = makeUser()
    const tok = generateSessionToken()
    const past = 1_000
    createSession(db, { token: tok, userId: u.id, now: past })
    // now molto avanti → scaduta
    expect(findSession(db, tok, past + SESSION_TTL_MS + 1)).toBeNull()
  })

  it('findSession ritorna null per token inesistente', () => {
    expect(findSession(db, 'no-such-token')).toBeNull()
  })

  it('extendSession aggiorna lastActivityAt e NON prolunga se fuori soglia', () => {
    const u = makeUser()
    const tok = generateSessionToken()
    const createdAt = 1_000_000
    const original = createSession(db, { token: tok, userId: u.id, now: createdAt })
    // now appena dopo la creazione: residuo = TTL quasi intero, molto > threshold
    const laterBut = createdAt + 1000
    extendSession(db, tok, laterBut)
    const after = findSession(db, tok, laterBut)
    expect(after?.lastActivityAt).toBe(laterBut)
    expect(after?.expiresAt).toBe(original.expiresAt) // invariato
  })

  it('extendSession prolunga expiresAt quando residuo < threshold', () => {
    const u = makeUser()
    const tok = generateSessionToken()
    const createdAt = 1_000_000
    createSession(db, { token: tok, userId: u.id, now: createdAt })
    // avanza tempo: residuo = TTL - delta → dentro soglia quando delta > TTL-threshold
    const inside = createdAt + (SESSION_TTL_MS - SESSION_EXTEND_THRESHOLD_MS) + 1000
    extendSession(db, tok, inside)
    const after = findSession(db, tok, inside)
    expect(after?.lastActivityAt).toBe(inside)
    expect(after?.expiresAt).toBe(inside + SESSION_TTL_MS)
  })

  it('revokeSession cancella la riga', () => {
    const u = makeUser()
    const tok = generateSessionToken()
    createSession(db, { token: tok, userId: u.id })
    revokeSession(db, tok)
    expect(findSession(db, tok)).toBeNull()
  })

  it('revokeAllForUser cancella solo quelle dell user specifico', () => {
    const u1 = makeUser('U1')
    const u2 = makeUser('U2')
    const t1 = generateSessionToken()
    const t2 = generateSessionToken()
    const t3 = generateSessionToken()
    createSession(db, { token: t1, userId: u1.id })
    createSession(db, { token: t2, userId: u1.id })
    createSession(db, { token: t3, userId: u2.id })
    revokeAllForUser(db, u1.id)
    expect(findSession(db, t1)).toBeNull()
    expect(findSession(db, t2)).toBeNull()
    expect(findSession(db, t3)).not.toBeNull()
  })

  it('revokeAllForSuperadmin cancella solo quelle del superadmin', () => {
    const sa1 = makeSa('root1')
    const sa2 = makeSa('root2')
    const t1 = generateSessionToken()
    const t2 = generateSessionToken()
    createSession(db, { token: t1, superadminId: sa1.id })
    createSession(db, { token: t2, superadminId: sa2.id })
    revokeAllForSuperadmin(db, sa1.id)
    expect(findSession(db, t1)).toBeNull()
    expect(findSession(db, t2)).not.toBeNull()
  })

  it('cleanupExpiredSessions rimuove scadute e ritorna il conteggio', () => {
    const u = makeUser()
    const past = 1_000
    const fresh = 1_000_000_000
    const t1 = generateSessionToken()
    const t2 = generateSessionToken()
    const t3 = generateSessionToken()
    createSession(db, { token: t1, userId: u.id, now: past })
    createSession(db, { token: t2, userId: u.id, now: past })
    createSession(db, { token: t3, userId: u.id, now: fresh })
    // now che scade le prime due ma non la terza
    const n = cleanupExpiredSessions(db, past + SESSION_TTL_MS + 1)
    expect(n).toBe(2)
    expect(findSession(db, t3, fresh + 1)).not.toBeNull()
  })
})
