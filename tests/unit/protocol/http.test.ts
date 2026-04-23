import { describe, it, expect } from 'vitest'
import {
  CreatePartyBody, JoinPartyBody, ReclaimMasterBody, ResumeBody
} from '~~/shared/protocol/http'

describe('CreatePartyBody', () => {
  it('accetta nickname valido', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'Nick' }).success).toBe(true)
  })
  it('rifiuta nickname troppo corto', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'a' }).success).toBe(false)
  })
  it('rifiuta nickname troppo lungo', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'x'.repeat(25) }).success).toBe(false)
  })
  it('rifiuta caratteri non permessi', () => {
    expect(CreatePartyBody.safeParse({ masterNickname: 'Nick!' }).success).toBe(false)
  })
})

describe('JoinPartyBody', () => {
  it('accetta nickname valido', () => {
    expect(JoinPartyBody.safeParse({ nickname: 'Anna' }).success).toBe(true)
  })
})

describe('ReclaimMasterBody', () => {
  it('accetta token non vuoto', () => {
    expect(ReclaimMasterBody.safeParse({ masterToken: 'abcd1234' }).success).toBe(true)
  })
  it('rifiuta token vuoto', () => {
    expect(ReclaimMasterBody.safeParse({ masterToken: '' }).success).toBe(false)
  })
})

describe('ResumeBody', () => {
  it('accetta token', () => {
    expect(ResumeBody.safeParse({ sessionToken: 'xyz' }).success).toBe(true)
  })
})
