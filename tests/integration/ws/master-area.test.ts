import { describe, it, expect } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { registerApproveLogin, uniqueUsername } from '../helpers/e2e-auth'
import {
  openWsWithCookie, nextMessageMatching,
  createPartyApi, joinPartyApi
} from '../helpers/ws-helpers'
import { generate } from '~~/shared/map/generators'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-mastarea-'))
const dbPath = join(tmpDir, 'gdr.sqlite')

await setup({
  rootDir,
  dev: false,
  server: true,
  build: false,
  nuxtConfig: {
    nitro: { output: { dir: resolve(rootDir, '.output') } }
  },
  env: { DATABASE_URL: dbPath }
})

interface InitLike {
  me: { currentMapId: string, currentAreaId: string }
  maps: Array<{ id: string, mapTypeId: string, mapSeed: string, params: Record<string, unknown> }>
}

// v2d: ricava un'area adiacente alla spawn area dal GeneratedMap della
// mappa corrente, così i test non dipendono dai nomi legacy AREA_IDS.
function adjacentArea(init: InitLike): string {
  const myMap = init.maps.find(m => m.id === init.me.currentMapId)!
  const gm = generate(myMap.mapTypeId, myMap.mapSeed, myMap.params)
  return gm.adjacency[init.me.currentAreaId]![0]!
}

describe('master:area (close/open)', () => {
  it('master chiude un area, user riceve area:updated e non puo entrarci', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPartyApi(masterCookie, 'MM')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const wsM = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(wsM, m => m.type === 'state:init')
    const wsA = await openWsWithCookie(seed, annaCookie)
    const initA = await nextMessageMatching(wsA, m => m.type === 'state:init') as unknown as InitLike
    const targetArea = adjacentArea(initA)

    // Master chiude targetArea
    wsM.send(JSON.stringify({ type: 'master:area', areaId: targetArea, status: 'closed' }))
    const upd = await nextMessageMatching(wsA, m => m.type === 'area:updated')
    const patch = (upd as { patch: { areaId: string, status: string } }).patch
    expect(patch.areaId).toBe(targetArea)
    expect(patch.status).toBe('closed')

    // Anna prova a muoversi nella chiusa → errore
    wsA.send(JSON.stringify({ type: 'move:request', toAreaId: targetArea }))
    const err = await nextMessageMatching(wsA, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('area_closed')

    // Master riapre
    wsM.send(JSON.stringify({ type: 'master:area', areaId: targetArea, status: 'intact' }))
    const upd2 = await nextMessageMatching(wsA, m => m.type === 'area:updated')
    expect((upd2 as { patch: { status: string } }).patch.status).toBe('intact')

    // Anna ora si muove
    wsA.send(JSON.stringify({ type: 'move:request', toAreaId: targetArea }))
    const moved = await nextMessageMatching(wsA, m => m.type === 'player:moved')
    expect((moved as { toAreaId: string }).toAreaId).toBe(targetArea)

    wsM.close()
    wsA.close()
  })

  it('non-master riceve master_only se tenta /close', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPartyApi(masterCookie, 'MM2')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const wsA = await openWsWithCookie(seed, annaCookie)
    const initA = await nextMessageMatching(wsA, m => m.type === 'state:init') as unknown as InitLike
    const targetArea = adjacentArea(initA)
    wsA.send(JSON.stringify({ type: 'master:area', areaId: targetArea, status: 'closed' }))
    const err = await nextMessageMatching(wsA, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('master_only')

    wsA.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
