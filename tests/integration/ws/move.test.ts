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
      } catch { /* ignore */ }
    }
    ws.on('message', onMsg)
  })
}

describe('move:request', () => {
  it('muove verso area adiacente con broadcast player:moved', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM' }
    }) as { seed: string, sessionToken: string }
    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    }) as { sessionToken: string, playerId: string }

    const masterWs = await openWs(create.seed, create.sessionToken)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')
    const annaWs = await openWs(create.seed, join.sessionToken)
    await nextMessageMatching(annaWs, m => m.type === 'state:init')

    annaWs.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))

    const masterMoved = await nextMessageMatching(masterWs, m => m.type === 'player:moved')
    const annaMoved = await nextMessageMatching(annaWs, m => m.type === 'player:moved')
    expect((masterMoved as { toAreaId: string }).toAreaId).toBe('chiesa')
    expect((annaMoved as { toAreaId: string }).toAreaId).toBe('chiesa')

    masterWs.close()
    annaWs.close()
  })

  it('rifiuta area non adiacente per utente con not_adjacent', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM2' }
    }) as { seed: string, sessionToken: string }
    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Luca' }
    }) as { sessionToken: string }

    const ws = await openWs(create.seed, join.sessionToken)
    await nextMessageMatching(ws, m => m.type === 'state:init')

    ws.send(JSON.stringify({ type: 'move:request', toAreaId: 'rifugio' }))
    const err = await nextMessageMatching(ws, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('not_adjacent')

    ws.close()
  })

  it('master ignora adiacenza', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM3' }
    }) as { seed: string, sessionToken: string }

    const ws = await openWs(create.seed, create.sessionToken)
    await nextMessageMatching(ws, m => m.type === 'state:init')

    ws.send(JSON.stringify({ type: 'move:request', toAreaId: 'rifugio' }))
    const moved = await nextMessageMatching(ws, m => m.type === 'player:moved')
    expect((moved as { toAreaId: string }).toAreaId).toBe('rifugio')

    ws.close()
  })
})
