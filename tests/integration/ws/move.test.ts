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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-move-'))
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

interface StateInit {
  me: { currentMapId: string, currentAreaId: string }
  maps: Array<{ id: string, mapTypeId: string, mapSeed: string, params: Record<string, unknown> }>
}

interface AreasResolved {
  myAreaId: string
  adjacentAreaId: string
  nonAdjacentAreaId: string
}

// v2d: ricava area corrente + un'area adiacente + un'area NON adiacente
// dalla spawn map della party (creata da T16/createParty). Le aree hanno
// id dinamici (slug del generator), niente più 'piazza'/'chiesa' hardcoded.
function resolveAreasFromInit(init: StateInit): AreasResolved {
  const myMap = init.maps.find(m => m.id === init.me.currentMapId)!
  const gm = generate(myMap.mapTypeId, myMap.mapSeed, myMap.params)
  const myAreaId = init.me.currentAreaId
  const adj = gm.adjacency[myAreaId] ?? []
  const adjacentAreaId = adj[0]!
  const adjSet = new Set<string>([myAreaId, ...adj])
  const nonAdjacentAreaId = gm.areas.find(a => !adjSet.has(a.id))!.id
  return { myAreaId, adjacentAreaId, nonAdjacentAreaId }
}

describe('move:request', () => {
  it('muove verso area adiacente con broadcast player:moved', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mm'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('am'))
    const seed = await createPartyApi(masterCookie, 'MM')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const masterWs = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')
    const annaWs = await openWsWithCookie(seed, annaCookie)
    const annaInit = await nextMessageMatching(annaWs, m => m.type === 'state:init') as unknown as StateInit
    const { adjacentAreaId } = resolveAreasFromInit(annaInit)

    annaWs.send(JSON.stringify({ type: 'move:request', toAreaId: adjacentAreaId }))

    const masterMoved = await nextMessageMatching(masterWs, m => m.type === 'player:moved')
    const annaMoved = await nextMessageMatching(annaWs, m => m.type === 'player:moved')
    expect((masterMoved as { toAreaId: string }).toAreaId).toBe(adjacentAreaId)
    expect((annaMoved as { toAreaId: string }).toAreaId).toBe(adjacentAreaId)

    masterWs.close()
    annaWs.close()
  })

  it('rifiuta area non adiacente per utente con not_adjacent', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mm2'))
    const { cookie: lucaCookie } = await registerApproveLogin(dbPath, uniqueUsername('lm'))
    const seed = await createPartyApi(masterCookie, 'MM2')
    await joinPartyApi(lucaCookie, seed, 'Luca')

    const ws = await openWsWithCookie(seed, lucaCookie)
    const init = await nextMessageMatching(ws, m => m.type === 'state:init') as unknown as StateInit
    const { nonAdjacentAreaId } = resolveAreasFromInit(init)

    ws.send(JSON.stringify({ type: 'move:request', toAreaId: nonAdjacentAreaId }))
    const err = await nextMessageMatching(ws, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('not_adjacent')

    ws.close()
  })

  it('master ignora adiacenza', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mm3'))
    const seed = await createPartyApi(masterCookie, 'MM3')

    const ws = await openWsWithCookie(seed, masterCookie)
    const init = await nextMessageMatching(ws, m => m.type === 'state:init') as unknown as StateInit
    const { nonAdjacentAreaId } = resolveAreasFromInit(init)

    ws.send(JSON.stringify({ type: 'move:request', toAreaId: nonAdjacentAreaId }))
    const moved = await nextMessageMatching(ws, m => m.type === 'player:moved')
    expect((moved as { toAreaId: string }).toAreaId).toBe(nonAdjacentAreaId)

    ws.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
