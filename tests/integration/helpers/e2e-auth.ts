import Database from 'better-sqlite3'
import { fetch } from '@nuxt/test-utils/e2e'

// Helper condivisi per i test end-to-end (api/*, ws/*) che usano un DB
// SQLite file passato al Nitro via env DATABASE_URL, così il processo di
// test può leggere/scrivere la stessa sqlite.
//
// Pattern: register via API → approve via UPDATE diretto (niente dipendenza
// da superadmin seed) → login via API → estrai il cookie gdr_session.

let ipCounter = 0
export function freshIp(): string {
  ipCounter += 1
  return `10.42.0.${ipCounter % 250}`
}

export function uniqueUsername(prefix = 'u'): string {
  return `${prefix}${Math.random().toString(36).slice(2, 10)}`
}

export function openTestDb(dbPath: string): Database.Database {
  return new Database(dbPath)
}

export function approveUserByName(dbPath: string, username: string): void {
  const db = openTestDb(dbPath)
  try {
    db.prepare(
      'UPDATE users SET status = ?, approved_at = ?, approved_by = ? WHERE username_lower = ?'
    ).run('approved', Date.now(), 'test-helper', username.toLowerCase())
  } finally {
    db.close()
  }
}

export async function registerUserViaApi(username: string, password = 'secret12'): Promise<void> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': freshIp() },
    body: JSON.stringify({ username, password })
  })
  if (res.status !== 202) {
    throw new Error(`register failed: ${res.status}`)
  }
}

// Ritorna la stringa del cookie nella forma `gdr_session=<token>` pronta
// per essere passata come header `cookie`.
export async function loginAndGetCookie(username: string, password = 'secret12'): Promise<string> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username, password })
  })
  if (res.status !== 200) {
    throw new Error(`login failed: ${res.status}`)
  }
  const setCookie = res.headers.get('set-cookie') ?? ''
  const m = setCookie.match(/gdr_session=([^;]+)/)
  if (!m) throw new Error('no session cookie in login response')
  return `gdr_session=${m[1]!}`
}

// Shortcut: register + approve (via DB diretto) + login, ritorna cookie.
export async function registerApproveLogin(
  dbPath: string,
  username?: string,
  password = 'secret12'
): Promise<{ username: string, cookie: string }> {
  const name = username ?? uniqueUsername()
  await registerUserViaApi(name, password)
  approveUserByName(dbPath, name)
  const cookie = await loginAndGetCookie(name, password)
  return { username: name, cookie }
}
