import WebSocket from 'ws'
import { url as nuxtUrl, fetch } from '@nuxt/test-utils/e2e'

// Helpers per i test WS v2a: l'autenticazione è nel cookie gdr_session
// portato nell'handshake HTTP dell'upgrade. La lib `ws` permette di
// passare headers arbitrari tramite il secondo argomento del costruttore.
export async function openWsWithCookie(seed: string, cookie: string): Promise<WebSocket> {
  const urlStr = nuxtUrl('/').replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/party'
  const ws = new WebSocket(urlStr, { headers: { cookie } })
  await new Promise<void>((resolve, reject) => {
    const onErr = (e: Error) => {
      ws.off('open', onOpen)
      reject(e)
    }
    const onOpen = () => {
      ws.off('error', onErr)
      resolve()
    }
    ws.once('open', onOpen)
    ws.once('error', onErr)
  })
  ws.send(JSON.stringify({ type: 'hello', seed }))
  return ws
}

export function nextMessage(ws: WebSocket): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const onMsg = (data: WebSocket.RawData) => {
      try {
        ws.off('message', onMsg)
        resolve(JSON.parse(String(data)) as Record<string, unknown>)
      } catch (e) {
        reject(e as Error)
      }
    }
    ws.on('message', onMsg)
  })
}

export function nextMessageMatching(
  ws: WebSocket,
  predicate: (m: Record<string, unknown>) => boolean,
  timeoutMs = 3000
): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg)
      reject(new Error('timeout waiting for message'))
    }, timeoutMs)
    function onMsg(data: WebSocket.RawData) {
      try {
        const m = JSON.parse(String(data)) as Record<string, unknown>
        if (predicate(m)) {
          ws.off('message', onMsg)
          clearTimeout(timer)
          resolve(m)
        }
      } catch { /* skip */ }
    }
    ws.on('message', onMsg)
  })
}

export function tryNextMessage(
  ws: WebSocket,
  predicate: (m: Record<string, unknown>) => boolean,
  timeoutMs = 500
): Promise<Record<string, unknown> | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      ws.off('message', onMsg)
      resolve(null)
    }, timeoutMs)
    function onMsg(data: WebSocket.RawData) {
      try {
        const m = JSON.parse(String(data)) as Record<string, unknown>
        if (predicate(m)) {
          ws.off('message', onMsg)
          clearTimeout(timer)
          resolve(m)
        }
      } catch { /* skip */ }
    }
    ws.on('message', onMsg)
  })
}

// Crea una party via API usando il cookie master e ritorna il seed.
// v2b: forziamo public+auto così i test WS, che si aspettano join diretto
// di altri user, continuano a girare senza richieste/inviti. I test che
// vogliono testare visibility/policy specifiche chiamano l'API direttamente.
export async function createPartyApi(cookie: string, displayName: string): Promise<string> {
  const res = await fetch('/api/parties', {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName, visibility: 'public', joinPolicy: 'auto' })
  })
  if (res.status !== 200) throw new Error(`createParty failed ${res.status}`)
  const body = await res.json() as { seed: string }
  return body.seed
}

// Unisce un player a una party con cookie user.
export async function joinPartyApi(cookie: string, seed: string, displayName: string): Promise<void> {
  const res = await fetch(`/api/parties/${seed}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie },
    body: JSON.stringify({ displayName })
  })
  if (res.status !== 200) throw new Error(`joinParty failed ${res.status}`)
}
