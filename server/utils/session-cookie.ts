import type { H3Event } from 'h3'
import { setCookie, deleteCookie } from 'h3'

export const SESSION_COOKIE_NAME = 'gdr_session'

// 30 giorni in secondi — coerente con SESSION_TTL_MS lato server.
const MAX_AGE_SECONDS = 30 * 24 * 60 * 60

export function setSessionCookie(event: H3Event, token: string): void {
  setCookie(event, SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: MAX_AGE_SECONDS,
    // secure richiede HTTPS: in dev usiamo http://localhost quindi off
    secure: process.env.NODE_ENV === 'production'
  })
}

export function clearSessionCookie(event: H3Event): void {
  deleteCookie(event, SESSION_COOKIE_NAME, { path: '/' })
}
