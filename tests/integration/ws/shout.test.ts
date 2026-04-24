import { describe, it, expect } from 'vitest'
import { setup } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import { registerApproveLogin, uniqueUsername } from '../helpers/e2e-auth'
import {
  openWsWithCookie, nextMessageMatching, tryNextMessage,
  createPartyApi, joinPartyApi
} from '../helpers/ws-helpers'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-shout-'))
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

describe('shout propaga ad aree adiacenti', () => {
  it('A in piazza grida, B in chiesa (adiacente) riceve, C in ospedale no', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: beaCookie } = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const { cookie: carlaCookie } = await registerApproveLogin(dbPath, uniqueUsername('c'))
    const seed = await createPartyApi(masterCookie, 'MM')
    await joinPartyApi(beaCookie, seed, 'Bea')
    await joinPartyApi(carlaCookie, seed, 'Carla')

    const wsMaster = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(wsMaster, m => m.type === 'state:init')
    const wsB = await openWsWithCookie(seed, beaCookie)
    await nextMessageMatching(wsB, m => m.type === 'state:init')
    const wsC = await openWsWithCookie(seed, carlaCookie)
    await nextMessageMatching(wsC, m => m.type === 'state:init')

    // B in chiesa (adiacente a piazza)
    wsB.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))
    await nextMessageMatching(wsB, m => m.type === 'player:moved')

    // C muove a polizia (adiacente a piazza), poi a ospedale (adiacente a
    // polizia ma NON a piazza — quindi non riceve shout da piazza).
    wsC.send(JSON.stringify({ type: 'move:request', toAreaId: 'polizia' }))
    await nextMessageMatching(wsC, m => m.type === 'player:moved' && (m as { toAreaId?: string }).toAreaId === 'polizia')
    wsC.send(JSON.stringify({ type: 'move:request', toAreaId: 'ospedale' }))
    await nextMessageMatching(wsC, m => m.type === 'player:moved' && (m as { toAreaId?: string }).toAreaId === 'ospedale')

    // Ora: M piazza, B chiesa, C ospedale. M grida da piazza.
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

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
