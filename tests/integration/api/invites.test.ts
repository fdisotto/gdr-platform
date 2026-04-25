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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-invites-'))
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

async function createPrivate(cookie: string, displayName: string): Promise<string> {
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, visibility: 'private', joinPolicy: 'request' })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  return ((await res.json()) as { seed: string }).seed
}

async function mintInvite(cookie: string, seed: string): Promise<{ id: string, token: string, url: string }> {
  const res = await fetch(`/api/parties/${seed}/invites`, {
    method: 'POST',
    headers: { cookie }
  })
  if (res.status !== 200) throw new Error(`mintInvite failed ${res.status}`)
  return await res.json() as { id: string, token: string, url: string }
}

describe('invites endpoints', () => {
  it('master crea invite, user lo usa per join', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPrivate(a.cookie, 'Master')
    const inv = await mintInvite(a.cookie, seed)
    expect(inv.token.length).toBeGreaterThan(20)
    expect(inv.url).toContain(seed)

    // join via inviteToken bypassa private/request
    const join = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ displayName: 'Bob', inviteToken: inv.token })
    })
    expect(join.status).toBe(200)
  })

  it('master revoca invite, riuso 403 invite_invalid', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPrivate(a.cookie, 'Master')
    const inv = await mintInvite(a.cookie, seed)
    const rev = await fetch(`/api/parties/${seed}/invites/${inv.id}/revoke`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(rev.status).toBe(200)

    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const join = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ displayName: 'Bob', inviteToken: inv.token })
    })
    expect(join.status).toBe(403)
  })

  it('riuso dopo consume → 403', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPrivate(a.cookie, 'Master')
    const inv = await mintInvite(a.cookie, seed)
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const ok = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ displayName: 'Bob', inviteToken: inv.token })
    })
    expect(ok.status).toBe(200)
    const c = await registerApproveLogin(dbPath, uniqueUsername('c'))
    const reuse = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': c.cookie },
      body: JSON.stringify({ displayName: 'Carla', inviteToken: inv.token })
    })
    expect(reuse.status).toBe(403)
  })

  it('non-master crea invite → 403', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPrivate(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/invites`, {
      method: 'POST',
      headers: { cookie: b.cookie }
    })
    expect(res.status).toBe(403)
  })

  it('list invites solo master', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPrivate(a.cookie, 'Master')
    await mintInvite(a.cookie, seed)
    await mintInvite(a.cookie, seed)
    const list = await fetch(`/api/parties/${seed}/invites`, {
      headers: { cookie: a.cookie }
    })
    expect(list.status).toBe(200)
    const j = await list.json() as { items: unknown[] }
    expect(j.items).toHaveLength(2)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
