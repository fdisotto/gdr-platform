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

describe('master:area (close/open)', () => {
  it('master chiude un area, user riceve area:updated e non puo entrarci', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPartyApi(masterCookie, 'MM')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const wsM = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(wsM, m => m.type === 'state:init')
    const wsA = await openWsWithCookie(seed, annaCookie)
    await nextMessageMatching(wsA, m => m.type === 'state:init')

    // Master chiude chiesa
    wsM.send(JSON.stringify({ type: 'master:area', areaId: 'chiesa', status: 'closed' }))
    const upd = await nextMessageMatching(wsA, m => m.type === 'area:updated')
    const patch = (upd as { patch: { areaId: string, status: string } }).patch
    expect(patch.areaId).toBe('chiesa')
    expect(patch.status).toBe('closed')

    // Anna prova a muoversi in chiesa → errore
    wsA.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))
    const err = await nextMessageMatching(wsA, m => m.type === 'error')
    expect((err as { code: string }).code).toBe('area_closed')

    // Master riapre
    wsM.send(JSON.stringify({ type: 'master:area', areaId: 'chiesa', status: 'intact' }))
    const upd2 = await nextMessageMatching(wsA, m => m.type === 'area:updated')
    expect((upd2 as { patch: { status: string } }).patch.status).toBe('intact')

    // Anna ora si muove in chiesa
    wsA.send(JSON.stringify({ type: 'move:request', toAreaId: 'chiesa' }))
    const moved = await nextMessageMatching(wsA, m => m.type === 'player:moved')
    expect((moved as { toAreaId: string }).toAreaId).toBe('chiesa')

    wsM.close()
    wsA.close()
  })

  it('non-master riceve master_only se tenta /close', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPartyApi(masterCookie, 'MM2')
    await joinPartyApi(annaCookie, seed, 'Anna')

    const wsA = await openWsWithCookie(seed, annaCookie)
    await nextMessageMatching(wsA, m => m.type === 'state:init')
    wsA.send(JSON.stringify({ type: 'master:area', areaId: 'chiesa', status: 'closed' }))
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
