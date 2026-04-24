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
    nitro: { output: { dir: resolve(rootDir, '.output') } }
  },
  env: { DATABASE_URL: ':memory:' }
})

function base() {
  return nuxtUrl('/')
}

async function openWs(seed: string, sessionToken: string) {
  const urlStr = base().replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/party'
  const ws = new WebSocket(urlStr)
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve())
    ws.once('error', e => reject(e))
  })
  ws.send(JSON.stringify({ type: 'hello', seed, sessionToken }))
  return ws
}

function nextMatching(ws: WebSocket, predicate: (m: Record<string, unknown>) => boolean, timeoutMs = 3000) {
  return new Promise<Record<string, unknown>>((resolve, reject) => {
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

describe('master:area (close/open)', () => {
  it('master chiude un area, user riceve area:updated e non puo entrarci', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST', body: { masterNickname: 'MM' }
    }) as { seed: string, sessionToken: string }
    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST', body: { nickname: 'Anna' }
    }) as { sessionToken: string }

    const wsM = await openWs(create.seed, create.sessionToken)
    await nextMatching(wsM, m => m.type === 'state:init')
    const wsA = await openWs(create.seed, join.sessionToken)
    await nextMatching(wsA, m => m.type === 'state:init')

    // Master chiude chiesa
    wsM.send(JSON.stringify({ type: 'master:area', areaId: 'chiesa', status: 'closed' }))
    const upd = await nextMatching(wsA, m => m.type === 'area:updated')
    const patch = (upd as { patch: { areaId: string, status: string } }).patch
    expect(patch.areaId).toBe('chiesa')
    expect(patch.status).toBe('closed')

    // Anna prova a muoversi in chiesa → errore
    wsA.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))
    const err = await nextMatching(wsA, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('area_closed')

    // Master riapre
    wsM.send(JSON.stringify({ type: 'master:area', areaId: 'chiesa', status: 'intact' }))
    const upd2 = await nextMatching(wsA, m => m.type === 'area:updated')
    expect((upd2 as { patch: { status: string } }).patch.status).toBe('intact')

    // Anna ora si muove in chiesa
    wsA.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))
    const moved = await nextMatching(wsA, m => m.type === 'player:moved')
    expect((moved as { toAreaId: string }).toAreaId).toBe('chiesa')

    wsM.close()
    wsA.close()
  })

  it('non-master riceve master_only se tenta /close', async () => {
    const create = await $fetch('/api/parties', {
      method: 'POST', body: { masterNickname: 'MM2' }
    }) as { seed: string, sessionToken: string }
    const join = await $fetch(`/api/parties/${create.seed}/join`, {
      method: 'POST', body: { nickname: 'Anna' }
    }) as { sessionToken: string }

    const wsA = await openWs(create.seed, join.sessionToken)
    await nextMatching(wsA, m => m.type === 'state:init')
    wsA.send(JSON.stringify({ type: 'master:area', areaId: 'chiesa', status: 'closed' }))
    const err = await nextMatching(wsA, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('master_only')

    wsA.close()
  })
})
