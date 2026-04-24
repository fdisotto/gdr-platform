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

function nextMessageMatching(ws: WebSocket, predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 3000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg)
      reject(new Error('timeout'))
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

function tryNextMessage(ws: WebSocket, predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 500): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg)
      resolve(null)
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

describe('shout propaga ad aree adiacenti', () => {
  it('A in piazza grida, B in chiesa (adiacente) riceve, C in ospedale no', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM' }
    }) as { seed: string, sessionToken: string }
    const joinB = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Bea' }
    }) as { sessionToken: string }
    const joinC = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Carla' }
    }) as { sessionToken: string }

    const wsMaster = await openWs(create.seed, create.sessionToken)
    await nextMessageMatching(wsMaster, m => m.type === 'state:init')
    const wsB = await openWs(create.seed, joinB.sessionToken)
    await nextMessageMatching(wsB, m => m.type === 'state:init')
    const wsC = await openWs(create.seed, joinC.sessionToken)
    await nextMessageMatching(wsC, m => m.type === 'state:init')

    // Master muove B in chiesa (adiacente a piazza)
    wsB.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))
    await nextMessageMatching(wsB, m => m.type === 'player:moved')

    // C muove a polizia (adiacente a piazza), poi a ospedale (adiacente a
    // polizia ma NON a piazza — quindi non riceve shout da piazza).
    // Il match filtra su toAreaId per evitare race con i broadcast di B.
    wsC.send(JSON.stringify({ type: 'move:request', toAreaId: 'polizia' }))
    await nextMessageMatching(wsC, m => m.type === 'player:moved' && (m as { toAreaId?: string }).toAreaId === 'polizia')
    wsC.send(JSON.stringify({ type: 'move:request', toAreaId: 'ospedale' }))
    await nextMessageMatching(wsC, m => m.type === 'player:moved' && (m as { toAreaId?: string }).toAreaId === 'ospedale')

    // Ora: M piazza, B chiesa, C ospedale.
    // M grida da piazza.
    wsMaster.send(JSON.stringify({
      type: 'chat:send', kind: 'shout', body: 'AIUTO', areaId: 'piazza'
    }))

    // M stesso riceve message:new (è nell area + è master)
    const mReceived = await nextMessageMatching(wsMaster, m => m.type === 'message:new')
    expect((mReceived as { message: { kind: string } }).message.kind).toBe('shout')
    // B in chiesa (adiacente a piazza) riceve
    const bReceived = await nextMessageMatching(wsB, m => m.type === 'message:new', 2000)
    expect((bReceived as { message: { body: string } }).message.body).toBe('AIUTO')
    // C in ospedale (non adiacente a piazza) non riceve entro 500ms
    const cMaybe = await tryNextMessage(wsC, m => m.type === 'message:new', 500)
    expect(cMaybe).toBeNull()

    wsMaster.close()
    wsB.close()
    wsC.close()
  })
})
