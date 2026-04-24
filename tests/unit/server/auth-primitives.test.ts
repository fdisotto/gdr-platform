import { describe, it, expect } from 'vitest'
import { hashPassword, verifyPassword, generateSessionToken } from '~~/server/services/auth'

describe('auth primitives', () => {
  it('hashPassword + verifyPassword round-trip', async () => {
    const h = await hashPassword('secret123')
    expect(await verifyPassword('secret123', h)).toBe(true)
    expect(await verifyPassword('wrong', h)).toBe(false)
  })

  it('hashPassword produce hash diversi per lo stesso input (salt)', async () => {
    const h1 = await hashPassword('x')
    const h2 = await hashPassword('x')
    expect(h1).not.toBe(h2)
    expect(await verifyPassword('x', h1)).toBe(true)
    expect(await verifyPassword('x', h2)).toBe(true)
  })

  it('generateSessionToken ritorna stringa url-safe', () => {
    const t = generateSessionToken()
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
    // base64url 32 bytes → 43 char (no padding)
    expect(t.length).toBeGreaterThanOrEqual(43)
  })

  it('generateSessionToken produce valori unici', () => {
    const tokens = new Set<string>()
    for (let i = 0; i < 50; i++) tokens.add(generateSessionToken())
    expect(tokens.size).toBe(50)
  })
})
