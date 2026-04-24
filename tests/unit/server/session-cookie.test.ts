import { describe, it, expect } from 'vitest'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { createEvent, getResponseHeader } from 'h3'
import type { H3Event } from 'h3'
import { setSessionCookie, clearSessionCookie, SESSION_COOKIE_NAME } from '~~/server/utils/session-cookie'

function mockEvent(): H3Event {
  const socket = new Socket()
  const req = new IncomingMessage(socket)
  req.url = '/test'
  req.method = 'GET'
  const res = new ServerResponse(req)
  return createEvent(req, res)
}

describe('session cookie helpers', () => {
  it('SESSION_COOKIE_NAME è gdr_session', () => {
    expect(SESSION_COOKIE_NAME).toBe('gdr_session')
  })

  it('setSessionCookie imposta httpOnly, sameSite lax, path /, maxAge 30d', () => {
    const ev = mockEvent()
    setSessionCookie(ev, 'tok123')
    const setCookieHeader = getResponseHeader(ev, 'set-cookie')
    const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : String(setCookieHeader)
    expect(raw).toContain('gdr_session=tok123')
    expect(raw.toLowerCase()).toContain('httponly')
    expect(raw.toLowerCase()).toContain('samesite=lax')
    expect(raw).toContain('Path=/')
    expect(raw).toContain('Max-Age=2592000')
  })

  it('setSessionCookie NON include Secure in ambiente non-production', () => {
    const prev = process.env.NODE_ENV
    process.env.NODE_ENV = 'test'
    try {
      const ev = mockEvent()
      setSessionCookie(ev, 'tok')
      const setCookieHeader = getResponseHeader(ev, 'set-cookie')
      const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : String(setCookieHeader)
      expect(raw.toLowerCase()).not.toContain('secure')
    } finally {
      process.env.NODE_ENV = prev
    }
  })

  it('clearSessionCookie imposta Max-Age=0', () => {
    const ev = mockEvent()
    clearSessionCookie(ev)
    const setCookieHeader = getResponseHeader(ev, 'set-cookie')
    const raw = Array.isArray(setCookieHeader) ? setCookieHeader.join(';') : String(setCookieHeader)
    expect(raw).toContain('gdr_session=')
    expect(raw).toContain('Max-Age=0')
  })
})
