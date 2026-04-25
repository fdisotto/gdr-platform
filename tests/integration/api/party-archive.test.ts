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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-archive-'))
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

describe('POST /api/parties/:seed/archive', () => {
  it('master archivia ok', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const res = await fetch(`/api/parties/${seed}/archive`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(res.status).toBe(200)
    // join verso una party archived → 410 archived
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const join = await fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ displayName: 'Bob' })
    })
    expect(join.status).toBe(410)
  })

  it('non-master → 403 master_only', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    await joinPartyApi(b.cookie, seed, 'Bob')
    const res = await fetch(`/api/parties/${seed}/archive`, {
      method: 'POST',
      headers: { cookie: b.cookie }
    })
    expect(res.status).toBe(403)
  })

  it('già archivata → 409 conflict', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicAuto(a.cookie, 'Master')
    const r1 = await fetch(`/api/parties/${seed}/archive`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(r1.status).toBe(200)
    const r2 = await fetch(`/api/parties/${seed}/archive`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(r2.status).toBe(409)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
