import { describe, it, expect } from 'vitest'
import { parseSlash } from '~~/shared/slash/parse'

describe('parseSlash', () => {
  it('senza slash iniziale torna say', () => {
    expect(parseSlash('ciao a tutti')).toEqual({
      ok: true, command: { kind: 'say', body: 'ciao a tutti' }
    })
  })

  it('/w target body → whisper', () => {
    expect(parseSlash('/w Anna ciao')).toEqual({
      ok: true, command: { kind: 'whisper', target: 'Anna', body: 'ciao' }
    })
  })

  it('/me body → emote', () => {
    expect(parseSlash('/me apre la porta')).toEqual({
      ok: true, command: { kind: 'emote', body: 'apre la porta' }
    })
  })

  it('/ooc body → ooc', () => {
    expect(parseSlash('/ooc chi è di turno?')).toEqual({
      ok: true, command: { kind: 'ooc', body: 'chi è di turno?' }
    })
  })

  it('/shout body → shout', () => {
    expect(parseSlash('/shout aiuto!')).toEqual({
      ok: true, command: { kind: 'shout', body: 'aiuto!' }
    })
  })

  it('/roll expr → roll', () => {
    expect(parseSlash('/roll 2d6+3')).toEqual({
      ok: true, command: { kind: 'roll', expr: '2d6+3', hidden: false }
    })
  })

  it('/roll! expr → hidden roll master', () => {
    expect(parseSlash('/roll! 1d20')).toEqual({
      ok: true, command: { kind: 'roll', expr: '1d20', hidden: true }
    })
  })

  it('/dm target body', () => {
    expect(parseSlash('/dm Luca arrivo presto')).toEqual({
      ok: true, command: { kind: 'dm', target: 'Luca', body: 'arrivo presto' }
    })
  })

  it('/npc Nome body (master)', () => {
    expect(parseSlash('/npc "Sceriffo Cole" avvicinatevi')).toEqual({
      ok: true, command: { kind: 'npc', npcName: 'Sceriffo Cole', body: 'avvicinatevi' }
    })
  })

  it('/npc senza virgolette accetta una parola singola', () => {
    expect(parseSlash('/npc Cole avvicinatevi')).toEqual({
      ok: true, command: { kind: 'npc', npcName: 'Cole', body: 'avvicinatevi' }
    })
  })

  it('/announce body', () => {
    expect(parseSlash('/announce trivella in arrivo')).toEqual({
      ok: true, command: { kind: 'announce', body: 'trivella in arrivo' }
    })
  })

  it('/mute nick 30 → mute con minuti', () => {
    expect(parseSlash('/mute Anna 30')).toEqual({
      ok: true, command: { kind: 'mute', target: 'Anna', minutes: 30 }
    })
  })

  it('/mute nick → permanente', () => {
    expect(parseSlash('/mute Anna')).toEqual({
      ok: true, command: { kind: 'mute', target: 'Anna', minutes: null }
    })
  })

  it('/unmute nick', () => {
    expect(parseSlash('/unmute Anna')).toEqual({
      ok: true, command: { kind: 'unmute', target: 'Anna' }
    })
  })

  it('/kick nick motivo', () => {
    expect(parseSlash('/kick Luca spam')).toEqual({
      ok: true, command: { kind: 'kick', target: 'Luca', reason: 'spam' }
    })
  })

  it('/ban nick motivo', () => {
    expect(parseSlash('/ban Luca flame')).toEqual({
      ok: true, command: { kind: 'ban', target: 'Luca', reason: 'flame' }
    })
  })

  it('/unban nick', () => {
    expect(parseSlash('/unban Luca')).toEqual({
      ok: true, command: { kind: 'unban', target: 'Luca' }
    })
  })

  it('/move nick area', () => {
    expect(parseSlash('/move Anna fogne')).toEqual({
      ok: true, command: { kind: 'move', target: 'Anna', areaId: 'fogne' }
    })
  })

  it('/close area', () => {
    expect(parseSlash('/close ospedale')).toEqual({
      ok: true, command: { kind: 'close', areaId: 'ospedale' }
    })
  })

  it('/open area', () => {
    expect(parseSlash('/open ospedale')).toEqual({
      ok: true, command: { kind: 'open', areaId: 'ospedale' }
    })
  })

  it('/weather area code intensity', () => {
    expect(parseSlash('/weather fogne fog 0.8')).toEqual({
      ok: true, command: { kind: 'weather', areaId: 'fogne', code: 'fog', intensity: 0.8 }
    })
  })

  it('/weather * code — globale', () => {
    expect(parseSlash('/weather * storm')).toEqual({
      ok: true, command: { kind: 'weather', areaId: null, code: 'storm', intensity: null }
    })
  })

  it('/weather area off → clear', () => {
    expect(parseSlash('/weather fogne off')).toEqual({
      ok: true, command: { kind: 'weather', areaId: 'fogne', clear: true }
    })
  })

  it('/setname area "nome"', () => {
    expect(parseSlash('/setname chiesa "Duomo Vecchio"')).toEqual({
      ok: true, command: { kind: 'setname', areaId: 'chiesa', newName: 'Duomo Vecchio' }
    })
  })

  it('/status area ruined', () => {
    expect(parseSlash('/status benzinaio ruined')).toEqual({
      ok: true, command: { kind: 'status', areaId: 'benzinaio', status: 'ruined' }
    })
  })

  it('comando sconosciuto → errore', () => {
    expect(parseSlash('/pippo ciao')).toMatchObject({ ok: false, error: expect.any(String) })
  })

  it('comando incompleto → errore', () => {
    expect(parseSlash('/w')).toMatchObject({ ok: false })
    expect(parseSlash('/roll')).toMatchObject({ ok: false })
  })
})
