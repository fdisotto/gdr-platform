import { describe, it, expect } from 'vitest'
import {
  CreatePartyBody, JoinPartyBody
} from '~~/shared/protocol/http'

describe('CreatePartyBody', () => {
  it('accetta displayName valido', () => {
    expect(CreatePartyBody.safeParse({ displayName: 'Nick' }).success).toBe(true)
  })
  it('accetta displayName + cityName opzionale', () => {
    expect(CreatePartyBody.safeParse({ displayName: 'Nick', cityName: 'Borgo' }).success).toBe(true)
  })
  it('rifiuta displayName troppo corto', () => {
    expect(CreatePartyBody.safeParse({ displayName: 'a' }).success).toBe(false)
  })
  it('rifiuta displayName troppo lungo', () => {
    expect(CreatePartyBody.safeParse({ displayName: 'x'.repeat(25) }).success).toBe(false)
  })
  it('rifiuta caratteri non permessi', () => {
    expect(CreatePartyBody.safeParse({ displayName: 'Nick!' }).success).toBe(false)
  })
})

describe('JoinPartyBody', () => {
  it('accetta displayName valido', () => {
    expect(JoinPartyBody.safeParse({ displayName: 'Anna' }).success).toBe(true)
  })
  it('rifiuta displayName troppo corto', () => {
    expect(JoinPartyBody.safeParse({ displayName: 'a' }).success).toBe(false)
  })
})
