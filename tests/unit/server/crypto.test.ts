import { describe, it, expect } from 'vitest'
import {
  generateToken, generateUuid, hashMasterToken, verifyMasterToken
} from '~~/server/utils/crypto'

describe('generateToken', () => {
  it('genera una stringa url-safe non vuota', () => {
    const t = generateToken(32)
    expect(t.length).toBeGreaterThan(20)
    expect(t).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('due generazioni sono diverse', () => {
    expect(generateToken(32)).not.toBe(generateToken(32))
  })
})

describe('generateUuid', () => {
  it('è un uuid v4', () => {
    const u = generateUuid()
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
})

describe('master token hashing', () => {
  it('hash + verify round-trip', async () => {
    const raw = generateToken(32)
    const h = await hashMasterToken(raw)
    expect(h).not.toBe(raw)
    expect(await verifyMasterToken(raw, h)).toBe(true)
    expect(await verifyMasterToken('altro', h)).toBe(false)
  })
})
