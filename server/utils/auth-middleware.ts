import type { H3Event } from 'h3'
import { createError, getCookie } from 'h3'
import { useDb } from '~~/server/utils/db'
import { findSession, extendSession, revokeSession } from '~~/server/services/sessions'
import { findUserById } from '~~/server/services/users'
import { findSuperadminById } from '~~/server/services/superadmins'

const COOKIE_NAME = 'gdr_session'

export type AuthIdentity
  = | { kind: 'user', id: string, username: string, mustReset: boolean }
    | { kind: 'superadmin', id: string, username: string, mustReset: boolean }
    | null

// Legge il cookie gdr_session, valida la sessione (cascade: non scaduta, user
// approved / superadmin esistente), estende in sliding e ritorna l'identità.
// null se cookie assente, sessione scaduta/revocata o user non più approved.
export async function readAuthIdentity(event: H3Event): Promise<AuthIdentity> {
  const token = getCookie(event, COOKIE_NAME)
  if (!token) return null
  const db = useDb()
  const session = findSession(db, token)
  if (!session) return null
  extendSession(db, token)

  if (session.userId) {
    const user = findUserById(db, session.userId)
    if (!user || user.status !== 'approved') {
      // account non più utilizzabile: revochiamo la sessione per evitare
      // che il cookie resti "zombie" lato client
      revokeSession(db, token)
      return null
    }
    return { kind: 'user', id: user.id, username: user.username, mustReset: user.mustReset }
  }

  if (session.superadminId) {
    const sa = findSuperadminById(db, session.superadminId)
    if (!sa) {
      revokeSession(db, token)
      return null
    }
    return { kind: 'superadmin', id: sa.id, username: sa.username, mustReset: sa.mustReset }
  }

  return null
}

export async function requireUser(event: H3Event): Promise<{ id: string, username: string, mustReset: boolean }> {
  const identity = await readAuthIdentity(event)
  if (!identity || identity.kind !== 'user') {
    throw createError({ statusCode: 401, statusMessage: 'session_expired' })
  }
  return { id: identity.id, username: identity.username, mustReset: identity.mustReset }
}

export interface RequireSuperadminOptions {
  // Se true permette l'accesso anche con mustReset=true (es. endpoint
  // change-password che è l'UNICO consentito in quello stato).
  allowMustReset?: boolean
}

export async function requireSuperadmin(
  event: H3Event,
  opts: RequireSuperadminOptions = {}
): Promise<{ id: string, username: string, mustReset: boolean }> {
  const identity = await readAuthIdentity(event)
  if (!identity || identity.kind !== 'superadmin') {
    throw createError({ statusCode: 401, statusMessage: 'session_expired' })
  }
  if (identity.mustReset && opts.allowMustReset !== true) {
    throw createError({ statusCode: 403, statusMessage: 'must_reset_first' })
  }
  return { id: identity.id, username: identity.username, mustReset: identity.mustReset }
}
