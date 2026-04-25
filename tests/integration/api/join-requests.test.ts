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
const tmpDir = mkdtempSync(join(tmpdir(), 'gdr-jreq-'))
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

async function meId(cookie: string): Promise<string> {
  const res = await fetch('/api/auth/me', { headers: { cookie } })
  const j = await res.json() as { id: string }
  return j.id
}

async function createPublicRequest(cookie: string, displayName: string): Promise<string> {
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, visibility: 'public', joinPolicy: 'request' })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  return ((await res.json()) as { seed: string }).seed
}

async function createReq(cookie: string, seed: string, displayName: string, message?: string): Promise<{ id: string }> {
  const res = await fetch(`/api/parties/${seed}/join-requests`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, message })
  })
  if (res.status !== 200) throw new Error(`createReq failed ${res.status}`)
  const body = await res.json() as { request: { id: string } }
  return { id: body.request.id }
}

describe('join-requests endpoints', () => {
  it('user crea richiesta, master la lista, master approva, user è membro', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPublicRequest(a.cookie, 'Master')
    const r = await createReq(b.cookie, seed, 'Bob', 'voglio entrare')
    expect(r.id).toBeTruthy()

    const list = await fetch(`/api/parties/${seed}/join-requests`, {
      headers: { cookie: a.cookie }
    })
    expect(list.status).toBe(200)
    const lj = await list.json() as { items: { id: string }[] }
    expect(lj.items.map(i => i.id)).toContain(r.id)

    const approve = await fetch(`/api/parties/${seed}/join-requests/${r.id}/approve`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(approve.status).toBe(200)

    // dopo approve, b è membro: prova a creare un'altra richiesta → 409 conflict
    const dup = await fetch(`/api/parties/${seed}/join-requests`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': b.cookie },
      body: JSON.stringify({ displayName: 'Bob' })
    })
    expect(dup.status).toBe(409)
  })

  it('GET lista richieste solo per master (403 user)', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const seed = await createPublicRequest(a.cookie, 'Master')
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const list = await fetch(`/api/parties/${seed}/join-requests`, {
      headers: { cookie: b.cookie }
    })
    expect(list.status).toBe(403)
  })

  it('master rifiuta richiesta', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPublicRequest(a.cookie, 'Master')
    const r = await createReq(b.cookie, seed, 'Bob')
    const reject = await fetch(`/api/parties/${seed}/join-requests/${r.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({ reason: 'pieno' })
    })
    expect(reject.status).toBe(200)
  })

  it('user cancella propria richiesta pending (DELETE)', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPublicRequest(a.cookie, 'Master')
    const r = await createReq(b.cookie, seed, 'Bob')
    const cancel = await fetch(`/api/parties/${seed}/join-requests/${r.id}/cancel`, {
      method: 'DELETE',
      headers: { cookie: b.cookie }
    })
    expect(cancel.status).toBe(200)
  })

  it('cancel di un altro utente → 403', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const c = await registerApproveLogin(dbPath, uniqueUsername('c'))
    const seed = await createPublicRequest(a.cookie, 'Master')
    const r = await createReq(b.cookie, seed, 'Bob')
    const cancel = await fetch(`/api/parties/${seed}/join-requests/${r.id}/cancel`, {
      method: 'DELETE',
      headers: { cookie: c.cookie }
    })
    expect(cancel.status).toBe(403)
  })

  it('approve di richiesta non-pending → 409', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    const seed = await createPublicRequest(a.cookie, 'Master')
    const r = await createReq(b.cookie, seed, 'Bob')
    await fetch(`/api/parties/${seed}/join-requests/${r.id}/reject`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'cookie': a.cookie },
      body: JSON.stringify({})
    })
    const approve = await fetch(`/api/parties/${seed}/join-requests/${r.id}/approve`, {
      method: 'POST',
      headers: { cookie: a.cookie }
    })
    expect(approve.status).toBe(409)
  })

  it('hasPendingRequest visibile nel browser dopo create', async () => {
    const a = await registerApproveLogin(dbPath, uniqueUsername('a'))
    const b = await registerApproveLogin(dbPath, uniqueUsername('b'))
    void await meId(b.cookie)
    const seed = await createPublicRequest(a.cookie, 'Master')
    await createReq(b.cookie, seed, 'Bob')
    const browse = await fetch('/api/parties', { headers: { cookie: b.cookie } })
    const page = await browse.json() as { items: { seed: string, hasPendingRequest: boolean }[] }
    const item = page.items.find(i => i.seed === seed)!
    expect(item.hasPendingRequest).toBe(true)
  })
})

process.on('exit', () => {
  try {
    rmSync(tmpDir, { recursive: true, force: true })
  } catch { /* ignore */ }
})
