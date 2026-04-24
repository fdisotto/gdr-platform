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

describe('presence player:joined / player:left', () => {
  it('il master riceve player:joined quando un user entra', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM' }
    }) as { seed: string, sessionToken: string }

    const masterWs = await openWs(create.seed, create.sessionToken)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')

    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Anna' }
    }) as { sessionToken: string, playerId: string }

    const annaWs = await openWs(create.seed, join.sessionToken)
    await nextMessageMatching(annaWs, m => m.type === 'state:init')

    const joined = await nextMessageMatching(masterWs, m => m.type === 'player:joined')
    expect((joined as { player: { nickname: string } }).player.nickname).toBe('Anna')

    masterWs.close()
    annaWs.close()
  })

  it('i player rimanenti ricevono player:left quando uno chiude', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST',
      body: { masterNickname: 'MM2' }
    }) as { seed: string, sessionToken: string }
    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST',
      body: { nickname: 'Luca' }
    }) as { sessionToken: string, playerId: string }

    const masterWs = await openWs(create.seed, create.sessionToken)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')
    const lucaWs = await openWs(create.seed, join.sessionToken)
    await nextMessageMatching(lucaWs, m => m.type === 'state:init')
    // master consuma il player:joined dell'ingresso di Luca
    await nextMessageMatching(masterWs, m => m.type === 'player:joined')

    lucaWs.close()
    const left = await nextMessageMatching(masterWs, m => m.type === 'player:left')
    expect((left as { playerId: string }).playerId).toBe(join.playerId)

    masterWs.close()
  })
})
