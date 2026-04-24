import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent } from 'h3'
import type { H3Event } from 'h3'

// Forza DB in-memory PRIMA di qualunque import che faccia lazy getDb().
process.env.DATABASE_URL = ':memory:'

// Import dopo impostazione env per rispettare la lazy init di getDb.
const { getDb, resetCache } = await import('~~/server/db/client')
const { readAuthIdentity, requireUser, requireSuperadmin } = await import('~~/server/utils/auth-middleware')
const { insertUser, approveUser, banUser } = await import('~~/server/services/users')
const { insertSuperadmin } = await import('~~/server/services/superadmins')
const { createSession, SESSION_TTL_MS } = await import('~~/server/services/sessions')
const { hashPassword, generateSessionToken } = await import('~~/server/services/auth')
const { generateUuid } = await import('~~/server/utils/crypto')

// Costruisce un H3Event mock con header Cookie opzionale.
function mockEvent(cookieHeader?: string): H3Event {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.url = '/test'
  req.method = 'GET'
  if (cookieHeader) req.headers.cookie = cookieHeader
  const res = new ServerResponse(req)
  return createEvent(req, res)
}

let db: ReturnType<typeof getDb>

beforeAll(() => {
  resetCache()
  db = getDb()
})

beforeEach(() => {
  // Svuota le tabelle rilevanti tra i test per isolamento
  db.$client.exec('DELETE FROM sessions; DELETE FROM users; DELETE FROM superadmins;')
})

async function seedApprovedUser() {
  const hash = await hashPassword('secret12')
  const u = insertUser(db, { id: generateUuid(), username: 'Mash', passwordHash: hash })
  approveUser(db, u.id, 'sa-1')
  return u
}

async function seedSuperadmin(mustReset = false) {
  const hash = await hashPassword('secret12')
  return insertSuperadmin(db, {
    id: generateUuid(),
    username: 'root',
    passwordHash: hash,
    mustReset
  })
}

describe('auth middleware', () => {
  it('readAuthIdentity ritorna null se non c è cookie', async () => {
    const ev = mockEvent()
    expect(await readAuthIdentity(ev)).toBeNull()
  })

  it('readAuthIdentity ritorna user identity con cookie valido', async () => {
    const user = await seedApprovedUser()
    const token = generateSessionToken()
    createSession(db, { token, userId: user.id })
    const ev = mockEvent(`gdr_session=${token}`)
    const id = await readAuthIdentity(ev)
    expect(id).toEqual({ kind: 'user', id: user.id, username: 'Mash', mustReset: false })
  })

  it('readAuthIdentity ritorna superadmin identity con cookie valido', async () => {
    const sa = await seedSuperadmin()
    const token = generateSessionToken()
    createSession(db, { token, superadminId: sa.id })
    const ev = mockEvent(`gdr_session=${token}`)
    const id = await readAuthIdentity(ev)
    expect(id).toEqual({ kind: 'superadmin', id: sa.id, username: 'root', mustReset: false })
  })

  it('readAuthIdentity ritorna null con cookie scaduto', async () => {
    const user = await seedApprovedUser()
    const token = generateSessionToken()
    const past = 1_000
    createSession(db, { token, userId: user.id, now: past })
    // force expiresAt passato
    db.$client.prepare('UPDATE sessions SET expires_at = ? WHERE token = ?')
      .run(past + SESSION_TTL_MS - SESSION_TTL_MS - 1, token)
    const ev = mockEvent(`gdr_session=${token}`)
    expect(await readAuthIdentity(ev)).toBeNull()
  })

  it('readAuthIdentity ritorna null se user è banned e revoca la sessione', async () => {
    const user = await seedApprovedUser()
    banUser(db, user.id, 'spam')
    const token = generateSessionToken()
    createSession(db, { token, userId: user.id })
    const ev = mockEvent(`gdr_session=${token}`)
    expect(await readAuthIdentity(ev)).toBeNull()
    // Sessione revocata
    const row = db.$client.prepare('SELECT * FROM sessions WHERE token = ?').get(token)
    expect(row).toBeUndefined()
  })

  it('readAuthIdentity ritorna null se user è pending', async () => {
    const hash = await hashPassword('secret12')
    const user = insertUser(db, { id: generateUuid(), username: 'Pen', passwordHash: hash })
    const token = generateSessionToken()
    createSession(db, { token, userId: user.id })
    const ev = mockEvent(`gdr_session=${token}`)
    expect(await readAuthIdentity(ev)).toBeNull()
  })

  it('requireUser lancia 401 session_expired se non c è identity', async () => {
    const ev = mockEvent()
    await expect(requireUser(ev)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'session_expired'
    })
  })

  it('requireUser lancia 401 se identity è superadmin', async () => {
    const sa = await seedSuperadmin()
    const token = generateSessionToken()
    createSession(db, { token, superadminId: sa.id })
    const ev = mockEvent(`gdr_session=${token}`)
    await expect(requireUser(ev)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'session_expired'
    })
  })

  it('requireUser ritorna user se valido', async () => {
    const user = await seedApprovedUser()
    const token = generateSessionToken()
    createSession(db, { token, userId: user.id })
    const ev = mockEvent(`gdr_session=${token}`)
    const r = await requireUser(ev)
    expect(r.id).toBe(user.id)
  })

  it('requireSuperadmin lancia 403 must_reset_first con mustReset=true (default)', async () => {
    const sa = await seedSuperadmin(true)
    const token = generateSessionToken()
    createSession(db, { token, superadminId: sa.id })
    const ev = mockEvent(`gdr_session=${token}`)
    await expect(requireSuperadmin(ev)).rejects.toMatchObject({
      statusCode: 403,
      statusMessage: 'must_reset_first'
    })
  })

  it('requireSuperadmin permette mustReset=true quando allowMustReset=true', async () => {
    const sa = await seedSuperadmin(true)
    const token = generateSessionToken()
    createSession(db, { token, superadminId: sa.id })
    const ev = mockEvent(`gdr_session=${token}`)
    const r = await requireSuperadmin(ev, { allowMustReset: true })
    expect(r.id).toBe(sa.id)
    expect(r.mustReset).toBe(true)
  })

  it('requireSuperadmin lancia 401 se identity è user', async () => {
    const user = await seedApprovedUser()
    const token = generateSessionToken()
    createSession(db, { token, userId: user.id })
    const ev = mockEvent(`gdr_session=${token}`)
    await expect(requireSuperadmin(ev)).rejects.toMatchObject({
      statusCode: 401,
      statusMessage: 'session_expired'
    })
  })
})
