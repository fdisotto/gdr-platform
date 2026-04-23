import { describe, it, expect } from 'vitest'
import { HelloEvent, MESSAGE_KINDS, ServerErrorEvent } from '~~/shared/protocol/ws'

describe('HelloEvent', () => {
  it('accetta seed uuid e sessionToken', () => {
    const ok = HelloEvent.safeParse({
      type: 'hello',
      seed: '550e8400-e29b-41d4-a716-446655440000',
      sessionToken: 'abc'
    })
    expect(ok.success).toBe(true)
  })

  it('rifiuta seed non-uuid', () => {
    expect(HelloEvent.safeParse({
      type: 'hello',
      seed: 'not-a-uuid',
      sessionToken: 'abc'
    }).success).toBe(false)
  })
})

describe('MESSAGE_KINDS', () => {
  it('contiene tutti i 10 kind', () => {
    const expected = ['say','whisper','emote','ooc','roll','shout','dm','npc','announce','system']
    for (const k of expected) expect(MESSAGE_KINDS).toContain(k)
  })
})

describe('ServerErrorEvent', () => {
  it('accetta code e detail', () => {
    expect(ServerErrorEvent.safeParse({
      type: 'error', code: 'not_found', detail: 'party X'
    }).success).toBe(true)
  })
})
