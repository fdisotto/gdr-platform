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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-promote-'))
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

interface UserInfo { id: string }

async function meId(cookie: string): Promise<string> {
  const res = await fetch('/api/auth/me', { headers: { cookie } })
  const j = await res.json() as UserInfo
  return j.id
}

async function createPublicAuto(cookie: string, displayName: string): Promise<string> {
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, visibility: 'public', joinPolicy: 'auto' })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  const body = await res.json() as { seed: string }
  return body.seed
}

async function joinPartyApi(cookie: string, seed: string, displayName: string): Promise<void> {
  const res = await fetch(`/api/parties/${seed}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName })
  })
  if (res.status !== 200) throw new Error(`join failed ${res.status}`)
}

describe('POST /api/parties/:seed/promote|demote', () => {
  it('master promuove user → diventa master', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const bId = await meId(b.cookie)
    const res = await fetch(`/api/parties/${seed}/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ targetUserId: bId })
    })
    expect(res.status).toBe(200)
  })

  it('non-master promote → 403 master_only', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const aId = await meId(a.cookie)
    const res = await fetch(`/api/parties/${seed}/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ targetUserId: aId })
    })
    expect(res.status).toBe(403)
  })

  it('demote unico master → 409 last_master', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const aId = await meId(a.cookie)
    const res = await fetch(`/api/parties/${seed}/demote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ targetUserId: aId })
    })
    expect(res.status).toBe(409)
  })

  it('self-demote ok con altro master', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const bId = await meId(b.cookie)
    const aId = await meId(a.cookie)
    const promote = await fetch(`/api/parties/${seed}/promote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ targetUserId: bId })
    })
    expect(promote.status).toBe(200)
    const demote = await fetch(`/api/parties/${seed}/demote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ targetUserId: aId })
    })
    expect(demote.status).toBe(200)
  })

  it('demote di non-master → 409 conflict', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const bId = await meId(b.cookie)
    const res = await fetch(`/api/parties/${seed}/demote`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ targetUserId: bId })
    })
    expect(res.status).toBe(409)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
