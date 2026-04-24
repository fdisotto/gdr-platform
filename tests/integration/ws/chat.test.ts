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

function nextMessageMatching(ws: WebSocket, predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg)
      reject(new Error('timeout waiting for message'))
    }, timeoutMs)
    function onMsg(data: WebSocket.RawData) {
      try {
        const m = JSON.parse(String(data)) as Record<string, unknown>
        if (predicate(m)) {
          ws.off('message', onMsg)
          clearTimeout(timer)
          resolve(m)
        }
      } catch { /* skip */ }
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
    await nextMessageMatching(masterWs, m => m.type === 'state:init')

    const annaWs = await openWs(create.seed, join.sessionToken)
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

    // kind non valido (es. 'system' non è nella ChatKind enum) → invalid_payload
    ws.send(JSON.stringify({ type: 'chat:send', kind: 'system', body: 'x', areaId: 'piazza' }))
    const err = await nextMessage(ws)
    expect(err.type).toBe('error')
    expect(err.code).toBe('invalid_payload')

    ws.close()
  })
})
