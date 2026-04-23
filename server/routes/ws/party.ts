import { HelloEvent, type StateInitEvent, type TimeTickEvent } from '~~/shared/protocol/ws'
import { useDb } from '~~/server/utils/db'
import { findPlayerBySession, listOnlinePlayers, touchPlayer } from '~~/server/services/players'
import { partyMustExist } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listAreaMessages, type MessageRow } from '~~/server/services/messages'
import { registry, sendJson } from '~~/server/ws/state'

const TIME_TICK_INTERVAL_MS = 60_000

let timeTickTimer: NodeJS.Timeout | null = null

function ensureTimeTickBroadcaster() {
  if (timeTickTimer) return
  timeTickTimer = setInterval(() => {
    const tick: TimeTickEvent = { type: 'time:tick', serverTime: Date.now() }
    const payload = JSON.stringify(tick)
    for (const conn of registry.all()) {
      try {
        conn.ws.send(payload)
      } catch { /* dead conn, ignore */ }
    }
  }, TIME_TICK_INTERVAL_MS)
  if (timeTickTimer && typeof timeTickTimer.unref === 'function') timeTickTimer.unref()
}

type Peer = {
  send(data: string): void
  close(code?: number, reason?: string): void
}

export default defineWebSocketHandler({
  open(_peer: Peer) {
    ensureTimeTickBroadcaster()
  },

  async message(peer: Peer, raw: { text(): string } | string | ArrayBuffer | Uint8Array) {
    let text: string
    if (typeof raw === 'string') {
      text = raw
    } else if (raw instanceof ArrayBuffer) {
      text = new TextDecoder().decode(raw)
    } else if (raw instanceof Uint8Array) {
      text = new TextDecoder().decode(raw)
    } else if (typeof (raw as { text?: () => string }).text === 'function') {
      text = (raw as { text: () => string }).text()
    } else {
      text = String(raw)
    }

    let parsed: Record<string, unknown> | null = null
    try {
      parsed = JSON.parse(text) as Record<string, unknown>
    } catch {
      sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'not_json' })
      return
    }

    if (parsed.type === 'hello') {
      const res = HelloEvent.safeParse(parsed)
      if (!res.success) {
        sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'hello_malformed' })
        return
      }
      await handleHello(peer, res.data.seed, res.data.sessionToken)
      return
    }

    // Task 7 aggiungerà chat:send.
  },

  close(peer: Peer) {
    registry.unregister(peer)
  }
})

async function handleHello(peer: Peer, seed: string, sessionToken: string) {
  try {
    const db = useDb()
    const party = partyMustExist(db, seed)
    const player = findPlayerBySession(db, seed, sessionToken)
    if (!player || player.isKicked) {
      sendJson(peer, { type: 'error', code: 'session_invalid' })
      peer.close(4001, 'session_invalid')
      return
    }

    registry.register(peer, {
      partySeed: seed,
      playerId: player.id,
      areaId: player.currentAreaId
    })

    const players = listOnlinePlayers(db, seed).map(p => ({
      id: p.id, nickname: p.nickname, role: p.role, currentAreaId: p.currentAreaId
    }))
    const areasState = listAreasState(db, seed)
    const messagesByArea: Record<string, MessageRow[]> = {}
    messagesByArea[player.currentAreaId] = listAreaMessages(db, seed, player.currentAreaId, 100)

    const init: StateInitEvent = {
      type: 'state:init',
      me: { id: player.id, nickname: player.nickname, role: player.role, currentAreaId: player.currentAreaId },
      party: { seed: party.seed, cityName: party.cityName, createdAt: party.createdAt, lastActivityAt: party.lastActivityAt },
      players,
      areasState,
      messagesByArea: messagesByArea as never,
      serverTime: Date.now()
    }
    sendJson(peer, init)
    touchPlayer(db, player.id)
  } catch (e) {
    sendJson(peer, { type: 'error', code: 'not_found', detail: (e as Error).message })
    peer.close(4004, 'not_found')
  }
}
