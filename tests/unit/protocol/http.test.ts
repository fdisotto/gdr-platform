import { describe, it, expect } from 'vitest'
import {
  CreatePartyBody, JoinPartyBody, BrowserQueryParams,
  JoinRequestCreateBody, RejectRequestBody, PromoteBody
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
  it('accetta inviteToken opzionale', () => {
    expect(JoinPartyBody.safeParse({
      displayName: 'Anna', inviteToken: 'tok-abcdef12'
    }).success).toBe(true)
  })
})

describe('CreatePartyBody v2b', () => {
  it('accetta visibility e joinPolicy', () => {
    const r = CreatePartyBody.safeParse({
      displayName: 'Nick', visibility: 'public', joinPolicy: 'auto'
    })
    expect(r.success).toBe(true)
  })
  it('rifiuta visibility invalido', () => {
    expect(CreatePartyBody.safeParse({
      displayName: 'Nick', visibility: 'wrong'
    }).success).toBe(false)
  })
})

describe('BrowserQueryParams', () => {
  it('parse base senza filtri', () => {
    expect(BrowserQueryParams.safeParse({}).success).toBe(true)
  })
  it('parse limit come stringa via coerce', () => {
    const r = BrowserQueryParams.safeParse({ limit: '20' })
    expect(r.success).toBe(true)
    if (r.success) expect(r.data.limit).toBe(20)
  })
  it('rifiuta limit fuori range', () => {
    expect(BrowserQueryParams.safeParse({ limit: '500' }).success).toBe(false)
  })
  it('accetta filtri stringa "1" / "true"', () => {
    expect(BrowserQueryParams.safeParse({ mine: '1', auto: 'true' }).success).toBe(true)
  })
})

describe('JoinRequestCreateBody', () => {
  it('accetta solo displayName', () => {
    expect(JoinRequestCreateBody.safeParse({ displayName: 'Anna' }).success).toBe(true)
  })
  it('accetta message opzionale', () => {
    expect(JoinRequestCreateBody.safeParse({
      displayName: 'Anna', message: 'voglio entrare'
    }).success).toBe(true)
  })
  it('rifiuta message troppo lungo', () => {
    expect(JoinRequestCreateBody.safeParse({
      displayName: 'Anna', message: 'x'.repeat(600)
    }).success).toBe(false)
  })
})

describe('RejectRequestBody', () => {
  it('accetta vuoto', () => {
    expect(RejectRequestBody.safeParse({}).success).toBe(true)
  })
  it('accetta reason', () => {
    expect(RejectRequestBody.safeParse({ reason: 'pieno' }).success).toBe(true)
  })
})

describe('PromoteBody', () => {
  it('richiede targetUserId', () => {
    expect(PromoteBody.safeParse({}).success).toBe(false)
    expect(PromoteBody.safeParse({ targetUserId: 'abc' }).success).toBe(true)
  })
})
