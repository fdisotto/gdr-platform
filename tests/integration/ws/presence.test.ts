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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-ws-presence-'))
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

describe('presence player:joined / player:left', () => {
  it('il master riceve player:joined quando un user entra', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mpj'))
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('apj'))
    const seed = await createPartyApi(masterCookie, 'MM')

    const masterWs = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')

    await joinPartyApi(annaCookie, seed, 'Anna')
    const annaWs = await openWsWithCookie(seed, annaCookie)
    await nextMessageMatching(annaWs, m => m.type === 'state:init')

    const joined = await nextMessageMatching(masterWs, m => m.type === 'player:joined')
    expect((joined as { player: { nickname: string } }).player.nickname).toBe('Anna')

    masterWs.close()
    annaWs.close()
  })

  it('i player rimanenti ricevono player:left quando uno chiude', async () => {
    const { cookie: masterCookie } = await registerApproveLogin(dbPath, uniqueUsername('mpl'))
    const { cookie: lucaCookie } = await registerApproveLogin(dbPath, uniqueUsername('lpl'))
    const seed = await createPartyApi(masterCookie, 'MM2')
    await joinPartyApi(lucaCookie, seed, 'Luca')

    const masterWs = await openWsWithCookie(seed, masterCookie)
    await nextMessageMatching(masterWs, m => m.type === 'state:init')
    const lucaWs = await openWsWithCookie(seed, lucaCookie)
    const lucaInit = await nextMessageMatching(lucaWs, m => m.type === 'state:init')
    const lucaPlayerId = (lucaInit as { me: { id: string } }).me.id
    // master consuma il player:joined dell'ingresso di Luca
    await nextMessageMatching(masterWs, m => m.type === 'player:joined')

    lucaWs.close()
    const left = await nextMessageMatching(masterWs, m => m.type === 'player:left')
    expect((left as { playerId: string }).playerId).toBe(lucaPlayerId)

    masterWs.close()
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
