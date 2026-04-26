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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-chatadv-'))
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
  me: { id: string, currentMapId: string, currentAreaId: string }
  maps: Array<{ id: string, mapTypeId: string, mapSeed: string, params: Record<string, unknown> }>
}

function adjacentArea(init: InitLike): string {
  const myMap = init.maps.find(m => m.id === init.me.currentMapId)!
  const gm = generate(myMap.mapTypeId, myMap.mapSeed, myMap.params)
  return gm.adjacency[init.me.currentAreaId]![0]!
}

describe('chat:send whisper/dm/roll', () => {
  it('whisper tra due player stessa area: entrambi + master', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const { cookie: beaCookie } = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPartyApi(masterCookie, 'MM')
    await joinPartyApi(annaCookie, seed, 'Anna')
    await joinPartyApi(beaCookie, seed, 'Bea')

    const wsM = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(wsM, m => m.type === 'state:init')
    const wsA = await openWsWithCookie(seed, annaCookie)
    const aInit = await nextMessageMatching(wsA, m => m.type === 'state:init') as unknown as InitLike
    const wsB = await openWsWithCookie(seed, beaCookie)
    const bInit = await nextMessageMatching(wsB, m => m.type === 'state:init') as unknown as InitLike
    const beaId = bInit.me.id
    const myArea = aInit.me.currentAreaId

    wsA.send(JSON.stringify({
      type: 'chat:send', kind: 'whisper', body: 'segreto',
      areaId: myArea, targetPlayerId: 'Bea'
    }))

    const [mA, mB, mM] = await Promise.all([
      nextMessageMatching(wsA, m => m.type === 'message:new'),
      nextMessageMatching(wsB, m => m.type === 'message:new'),
      nextMessageMatching(wsM, m => m.type === 'message:new')
    ])
    expect((mA.message as { kind: string }).kind).toBe('whisper')
    expect((mB.message as { body: string }).body).toBe('segreto')
    expect((mM.message as { targetPlayerId: string }).targetPlayerId).toBe(beaId)

    wsM.close()
    wsA.close()
    wsB.close()
  })

  it('whisper rifiutato se target in altra area', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const { cookie: beaCookie } = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPartyApi(masterCookie, 'MM2')
    await joinPartyApi(annaCookie, seed, 'Anna')
    await joinPartyApi(beaCookie, seed, 'Bea')

    const wsA = await openWsWithCookie(seed, annaCookie)
    const aInit = await nextMessageMatching(wsA, m => m.type === 'state:init') as unknown as InitLike
    const wsB = await openWsWithCookie(seed, beaCookie)
    const bInit = await nextMessageMatching(wsB, m => m.type === 'state:init') as unknown as InitLike
    const adjForB = adjacentArea(bInit)

    // B si muove in area adiacente
    wsB.send(JSON.stringify({ type: 'move:request', toAreaId: adjForB }))
    await nextMessageMatching(wsB, m => m.type === 'player:moved')

    // A tenta whisper verso B (che ora sta altrove)
    wsA.send(JSON.stringify({
      type: 'chat:send', kind: 'whisper', body: 'prova',
      areaId: aInit.me.currentAreaId, targetPlayerId: 'Bea'
    }))
    const err = await nextMessageMatching(wsA, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('forbidden')

    wsA.close()
    wsB.close()
  })

  it('dm funziona cross-area', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const { cookie: beaCookie } = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPartyApi(masterCookie, 'MM3')
    await joinPartyApi(annaCookie, seed, 'Anna')
    await joinPartyApi(beaCookie, seed, 'Bea')

    const wsA = await openWsWithCookie(seed, annaCookie)
    await nextMessageMatching(wsA, m => m.type === 'state:init')
    const wsB = await openWsWithCookie(seed, beaCookie)
    const bInit = await nextMessageMatching(wsB, m => m.type === 'state:init') as unknown as InitLike
    const adjForB = adjacentArea(bInit)

    // B si sposta in area adiacente
    wsB.send(JSON.stringify({ type: 'move:request', toAreaId: adjForB }))
    await nextMessageMatching(wsB, m => m.type === 'player:moved')

    wsA.send(JSON.stringify({
      type: 'chat:send', kind: 'dm', body: 'ciao cross area',
      targetPlayerId: 'Bea'
    }))

    const mB = await nextMessageMatching(wsB, m => m.type === 'message:new')
    expect((mB.message as { kind: string, areaId: string | null }).kind).toBe('dm')
    expect((mB.message as { areaId: string | null }).areaId).toBeNull()

    wsA.close()
    wsB.close()
  })

  it('roll parsa 2d6 server-side e pubblica risultato', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const seed = await createPartyApi(masterCookie, 'MM4')

    const wsM = await openWsWithCookie(seed, masterCookie)
    const init = await nextMessageMatching(wsM, m => m.type === 'state:init') as unknown as InitLike
    const myArea = init.me.currentAreaId

    wsM.send(JSON.stringify({
      type: 'chat:send', kind: 'roll', body: '2d6', rollExpr: '2d6',
      areaId: myArea
    }))

    const m = await nextMessageMatching(wsM, x => x.type === 'message:new')
    const msg = m.message as { kind: string, rollPayload: string | null }
    expect(msg.kind).toBe('roll')
    expect(msg.rollPayload).not.toBeNull()
    const payload = JSON.parse(msg.rollPayload!) as { total: number, rolls: { values: number[] }[] }
    expect(payload.total).toBeGreaterThanOrEqual(2)
    expect(payload.total).toBeLessThanOrEqual(12)

    wsM.close()
  })

  it('roll con expr invalido rifiutato', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const seed = await createPartyApi(masterCookie, 'MM5')

    const ws = await openWsWithCookie(seed, masterCookie)
    const init = await nextMessageMatching(ws, m => m.type === 'state:init') as unknown as InitLike
    const myArea = init.me.currentAreaId

    ws.send(JSON.stringify({
      type: 'chat:send', kind: 'roll', body: 'gabba', rollExpr: 'gabba',
      areaId: myArea
    }))
    const err = await nextMessageMatching(ws, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('bad_roll_expr')

    ws.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
