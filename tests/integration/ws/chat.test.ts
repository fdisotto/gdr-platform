import { describe, it, expect } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { registerApproveLogin, uniqueUsername } from '../helpers/e2e-auth'
import {
  openWsWithCookie, nextMessage, nextMessageMatching,
  createPartyApi, joinPartyApi
} from '../helpers/ws-helpers'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-chat-'))
const dbPath = join(tmpDir, 'gdr.sqlite')

await setup({
  rootDir,
  dev: false,
  server: true,
  build: false,
  nuxtConfig: {
    nitro: {
      output: {
        dir: resolve(rootDir, '.output')
      }
    }
  },
  env: { DATABASE_URL: dbPath }
})

describe('chat:send (say/emote/ooc)', () => {
  it('master invia say e riceve message:new', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m1'))
    const seed = await createPartyApi(masterCookie, 'M1')

    const ws = await openWsWithCookie(seed, masterCookie)
    const init = await nextMessage(ws)
    expect(init.type).toBe('state:init')

    ws.send(JSON.stringify({
      type: 'chat:send', kind: 'say', body: 'ciao', areaId: 'piazza'
    }))
    const msg = await nextMessage(ws)
    expect(msg.type).toBe('message:new')
    const m = msg.message as { body: string, kind: string }
    expect(m.body).toBe('ciao')
    expect(m.kind).toBe('say')

    ws.close()
  })

  it('due giocatori nella stessa area si vedono i messaggi', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m2'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a2'))
    const seed = await createPartyApi(masterCookie, 'M2')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const masterWs = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')

    const annaWs = await openWsWithCookie(seed, annaCookie)
    await nextMessageMatching(annaWs, m => m.type === 'state:init')

    annaWs.send(JSON.stringify({
      type: 'chat:send', kind: 'say', body: 'aiuto', areaId: 'piazza'
    }))

    const [annaEcho, masterReceive] = await Promise.all([
      nextMessageMatching(annaWs, m => m.type === 'message:new'),
      nextMessageMatching(masterWs, m => m.type === 'message:new')
    ])
    expect(annaEcho.type).toBe('message:new')
    expect(masterReceive.type).toBe('message:new')
    expect((masterReceive.message as { body: string }).body).toBe('aiuto')

    masterWs.close()
    annaWs.close()
  })

  it('emote e ooc sono accettati; kind invalido rifiutato', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m3'))
    const seed = await createPartyApi(masterCookie, 'M3')

    const ws = await openWsWithCookie(seed, masterCookie)
    await nextMessage(ws)

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'emote', body: 'annuisce', areaId: 'piazza' }))
    const emote = await nextMessage(ws)
    expect((emote.message as { kind: string }).kind).toBe('emote')

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'ooc', body: '((sento fame))', areaId: 'piazza' }))
    const ooc = await nextMessage(ws)
    expect((ooc.message as { kind: string }).kind).toBe('ooc')

    // kind non valido (es. 'system' non è nella ChatKind enum) → invalid_payload
    ws.send(JSON.stringify({ type: 'chat:send', kind: 'system', body: 'x', areaId: 'piazza' }))
    const err = await nextMessage(ws)
    expect(err.type).toBe('error')
    expect(err.code).toBe('invalid_payload')

    ws.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
