import { describe, it, expect } from 'vitest'
import { setup, $fetch, url as nuxtUrl } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import WebSocket from 'ws'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))

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
  env: { DATABASE_URL: ':memory:' }
})

function base(): string {
  // @nuxt/test-utils/e2e expose `url()` per ottenere la base URL del server.
  return nuxtUrl('/')
}

async function openWs(seed: string, sessionToken: string): Promise<WebSocket> {
  const rawBase = base()
  const urlStr = rawBase.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/party'
  const ws = new WebSocket(urlStr)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', e => reject(e))
  })
  ws.send(JSON.stringify({ type: 'hello', seed, sessionToken }))
  return ws
}

function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      try {
        ws.off('message', onMsg)
        resolve(JSON.parse(String(data)) as Record<string, unknown>)
      } catch (e) {
        reject(e as Error)
      }
    }
    ws.on('message', onMsg)
  })
}

describe('chat:send (say/emote/ooc)', () => {
  it('master invia say e riceve message:new', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'M1' }
    }) as { seed: string, sessionToken: string }

    const ws = await openWs(create.seed, create.sessionToken)
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
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'M2' }
    }) as { seed: string, sessionToken: string }

    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    }) as { sessionToken: string }

    const masterWs = await openWs(create.seed, create.sessionToken)
    await nextMessage(masterWs)

    const annaWs = await openWs(create.seed, join.sessionToken)
    await nextMessage(annaWs)

    annaWs.send(JSON.stringify({
      type: 'chat:send', kind: 'say', body: 'aiuto', areaId: 'piazza'
    }))

    const [annaEcho, masterReceive] = await Promise.all([
      nextMessage(annaWs),
      nextMessage(masterWs)
    ])
    expect(annaEcho.type).toBe('message:new')
    expect(masterReceive.type).toBe('message:new')
    expect((masterReceive.message as { body: string }).body).toBe('aiuto')

    masterWs.close()
    annaWs.close()
  })

  it('emote e ooc sono accettati; kind invalido rifiutato', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'M3' }
    }) as { seed: string, sessionToken: string }

    const ws = await openWs(create.seed, create.sessionToken)
    await nextMessage(ws)

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'emote', body: 'annuisce', areaId: 'piazza' }))
    const emote = await nextMessage(ws)
    expect((emote.message as { kind: string }).kind).toBe('emote')

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'ooc', body: '((sento fame))', areaId: 'piazza' }))
    const ooc = await nextMessage(ws)
    expect((ooc.message as { kind: string }).kind).toBe('ooc')

    ws.send(JSON.stringify({ type: 'chat:send', kind: 'whisper', body: 'x', areaId: 'piazza' }))
    const err = await nextMessage(ws)
    expect(err.type).toBe('error')
    expect(err.code).toBe('forbidden')

    ws.close()
  })
})
