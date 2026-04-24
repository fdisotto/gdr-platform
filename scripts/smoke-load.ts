/**
 * Smoke load test: apre N client WebSocket verso un server gdr-zombie locale,
 * ciascuno invia 1 messaggio ogni 2s per la durata totale, misura la latenza
 * end-to-end (tempo tra send e arrivo dell'echo message:new sullo stesso
 * mittente) e calcola percentili.
 *
 * Uso:
 *   pnpm dev      # avvia il server su :3000 in un altro terminale
 *   pnpm smoke    # esegue il test con defaults (30 player, 60s, 2s interval)
 *
 * Flags env:
 *   SMOKE_HOST       (default localhost:3000)
 *   SMOKE_CLIENTS    (default 30)
 *   SMOKE_DURATION_S (default 60)
 *   SMOKE_INTERVAL_S (default 2)
 *
 * Non include dependencies extra: usa ws (già in devDependencies) + fetch
 * nativo Node 20+.
 */

import WebSocket from 'ws'

const HOST = process.env.SMOKE_HOST ?? 'localhost:3000'
const N_CLIENTS = Number(process.env.SMOKE_CLIENTS ?? 30)
const DURATION_S = Number(process.env.SMOKE_DURATION_S ?? 60)
const INTERVAL_S = Number(process.env.SMOKE_INTERVAL_S ?? 2)

interface PendingSend {
  id: string
  sentAt: number
}

interface ClientStats {
  sent: number
  received: number
  errors: number
  latencies: number[]
}

const HTTP_BASE = `http://${HOST}`
const WS_BASE = `ws://${HOST}/ws/party`

async function createParty(): Promise<{ seed: string, sessionToken: string }> {
  const res = await fetch(`${HTTP_BASE}/api/parties`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ masterNickname: 'SmokeMaster' })
  })
  if (!res.ok) throw new Error(`createParty ${res.status}: ${await res.text()}`)
  const data = await res.json() as { seed: string, sessionToken: string }
  return { seed: data.seed, sessionToken: data.sessionToken }
}

async function joinParty(seed: string, nickname: string): Promise<string> {
  const res = await fetch(`${HTTP_BASE}/api/parties/${seed}/join`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ nickname })
  })
  if (!res.ok) throw new Error(`joinParty ${nickname} ${res.status}: ${await res.text()}`)
  const data = await res.json() as { sessionToken: string }
  return data.sessionToken
}

async function runClient(seed: string, sessionToken: string, nickname: string, stats: ClientStats, endAt: number): Promise<void> {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_BASE)
    const pending = new Map<string, PendingSend>()
    let timer: NodeJS.Timeout | null = null
    let closed = false

    const finish = () => {
      if (closed) return
      closed = true
      if (timer) clearInterval(timer)
      try {
        ws.close()
      } catch { /* skip */ }
      resolve()
    }

    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'hello', seed, sessionToken }))
      // Attendo state:init prima di cominciare a spammare
    })

    ws.on('message', (buf) => {
      let data: Record<string, unknown>
      try {
        data = JSON.parse(String(buf)) as Record<string, unknown>
      } catch {
        return
      }
      if (data.type === 'state:init') {
        // Avvio loop invii
        timer = setInterval(() => {
          if (Date.now() >= endAt) {
            finish()
            return
          }
          const id = `${nickname}-${stats.sent}`
          const body = `smoke ${id}`
          pending.set(body, { id, sentAt: Date.now() })
          ws.send(JSON.stringify({ type: 'chat:send', kind: 'say', body, areaId: 'piazza' }))
          stats.sent++
        }, INTERVAL_S * 1000)
      } else if (data.type === 'message:new') {
        const msg = (data as { message: { authorDisplay?: string, body?: string } }).message
        if (msg?.authorDisplay === nickname && msg.body) {
          const p = pending.get(msg.body)
          if (p) {
            const latency = Date.now() - p.sentAt
            stats.latencies.push(latency)
            stats.received++
            pending.delete(msg.body)
          }
        }
      } else if (data.type === 'error') {
        stats.errors++
      }
    })

    ws.on('error', () => {
      stats.errors++
    })
    ws.on('close', () => finish())

    // Safety net
    setTimeout(finish, (DURATION_S + 10) * 1000)
  })
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))
  return sorted[idx]!
}

async function main(): Promise<void> {
  console.log(`[smoke] host=${HOST} clients=${N_CLIENTS} duration=${DURATION_S}s interval=${INTERVAL_S}s`)

  const { seed } = await createParty()

  console.log(`[smoke] party seed=${seed}`)

  // Crea N session tokens
  const sessions: { nickname: string, sessionToken: string }[] = []
  for (let i = 0; i < N_CLIENTS; i++) {
    const nickname = `bot_${String(i).padStart(2, '0')}`
    const sessionToken = await joinParty(seed, nickname)
    sessions.push({ nickname, sessionToken })
  }

  console.log(`[smoke] ${sessions.length} bot iscritti, avvio clients…`)

  const endAt = Date.now() + DURATION_S * 1000
  const statsArray: ClientStats[] = sessions.map(() => ({ sent: 0, received: 0, errors: 0, latencies: [] }))

  await Promise.all(sessions.map((s, i) =>
    runClient(seed, s.sessionToken, s.nickname, statsArray[i]!, endAt)
  ))

  // Aggregati
  const totSent = statsArray.reduce((a, s) => a + s.sent, 0)
  const totRecv = statsArray.reduce((a, s) => a + s.received, 0)
  const totErr = statsArray.reduce((a, s) => a + s.errors, 0)
  const allLat = statsArray.flatMap(s => s.latencies)

  console.log('\n===== risultati =====')

  console.log(`inviati:         ${totSent}`)

  console.log(`ricevuti (echo): ${totRecv}`)

  console.log(`errori:          ${totErr}`)

  console.log(`error rate:      ${totSent > 0 ? ((totErr / totSent) * 100).toFixed(2) : '—'}%`)

  console.log(`loss echo:       ${totSent > 0 ? (((totSent - totRecv) / totSent) * 100).toFixed(2) : '—'}%`)
  if (allLat.length > 0) {
    const avg = allLat.reduce((a, b) => a + b, 0) / allLat.length

    console.log(`latenza avg:     ${avg.toFixed(1)} ms`)

    console.log(`latenza p50:     ${percentile(allLat, 50)} ms`)

    console.log(`latenza p95:     ${percentile(allLat, 95)} ms`)

    console.log(`latenza p99:     ${percentile(allLat, 99)} ms`)

    console.log(`latenza max:     ${Math.max(...allLat)} ms`)
  }

  // Soglie soft
  const avgLat = allLat.length > 0 ? allLat.reduce((a, b) => a + b, 0) / allLat.length : 0
  const errRate = totSent > 0 ? totErr / totSent : 0
  const pass = avgLat < 200 && errRate < 0.01

  console.log(`\nsoglia soft: latenza avg < 200ms AND error rate < 1% → ${pass ? 'OK ✓' : 'SFORATA ✗'}`)
  process.exit(pass ? 0 : 1)
}

main().catch((err) => {
  console.error('[smoke] fatal:', err)
  process.exit(2)
})
