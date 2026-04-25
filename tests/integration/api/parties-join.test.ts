import { describe, it, expect } from 'vitest'
import { setup, fetch } from '@nuxt/test-utils/e2e'
import { fileURLToPath } from 'node:url'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { mkdtempSync, rmSync } from 'node:fs'
import {
  registerApproveLogin, uniqueUsername
} from '../helpers/e2e-auth'

const rootDir = fileURLToPath(new URL('../../..', import.meta.url))
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-parties-join-'))
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

async function createPartyWith(
  displayName: string,
  opts: { visibility?: 'public' | 'private', joinPolicy?: 'auto' | 'request' } = {}
): Promise<{ seed: string, masterCookie: string }> {
  const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('m'))
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, ...opts })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  const body = await res.json() as { seed: string }
  return { seed: body.seed, masterCookie: cookie }
}

describe('POST /api/parties/:seed/join', () => {
  it('unisce un nuovo player in party public+auto', async () => {
    const { seed } = await createPartyWith('Master', { visibility: 'public', joinPolicy: 'auto' })
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const res = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': annaCookie },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body.sessionToken).toBeUndefined()
    const me = (body.initialState as { me: { nickname: string, role: string } }).me
    expect(me.nickname).toBe('Anna')
    expect(me.role).toBe('user')
  })

  it('rifiuta senza cookie auth con 401', async () => {
    const { seed } = await createPartyWith('Master', { visibility: 'public', joinPolicy: 'auto' })
    const res = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    expect(res.status).toBe(401)
  })

  it('rifiuta party inesistente con 404', async () => {
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const res = await fetch('/api/parties/00000000-0000-0000-0000-000000000000/join', {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    expect(res.status).toBe(404)
  })

  it('rifiuta displayName conflittuale con 409 (public+auto)', async () => {
    const { seed } = await createPartyWith('Master', { visibility: 'public', joinPolicy: 'auto' })
    const { cookie: annaCookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': annaCookie },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    const { cookie: bobCookie } = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const res = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': bobCookie },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    expect(res.status).toBe(409)
  })

  it('private senza inviteToken → 403 private_party', async () => {
    const { seed } = await createPartyWith('Master', { visibility: 'private', joinPolicy: 'request' })
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const res = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    expect(res.status).toBe(403)
  })

  it('public+request senza inviteToken → 403 request_required', async () => {
    const { seed } = await createPartyWith('Master', { visibility: 'public', joinPolicy: 'request' })
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const res = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Anna' })
    })
    expect(res.status).toBe(403)
  })

  it('inviteToken invalido → 403 invite_invalid', async () => {
    const { seed } = await createPartyWith('Master', { visibility: 'private', joinPolicy: 'request' })
    const { cookie } = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const res = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
      body: JSON.stringify({ displayName: 'Anna', inviteToken: 'bogus-token-xx' })
    })
    expect(res.status).toBe(403)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
