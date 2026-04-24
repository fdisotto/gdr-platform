import { HelloEvent, ChatSendEvent, MoveRequestEvent, HistoryFetchEvent, type StateInitEvent, type TimeTickEvent, type MessageNewEvent, type PlayerMovedEvent, type PlayerJoinedEvent, type PlayerLeftEvent, type HistoryBatchEvent } from '~~/shared/protocol/ws'
import { useDb } from '~~/server/utils/db'
import { findPlayerBySession, listOnlinePlayers, touchPlayer, updatePlayerArea } from '~~/server/services/players'
import { partyMustExist } from '~~/server/services/parties'
import { listAreasState } from '~~/server/services/areas'
import { listAreaMessages, insertMessage, listAreaMessagesBefore, listThreadMessagesBefore, listRecentDmsForPlayer, type MessageRow } from '~~/server/services/messages'
import { registry, sendJson, chatRateLimiter } from '~~/server/ws/state'
import { pickFanoutRecipients } from '~~/server/ws/fanout'
import { isAreaId, areAdjacent } from '~~/shared/map/areas'
import { isAreaClosed } from '~~/server/services/area-access'
import { parseRoll } from '~~/shared/dice/parse'
import { rollDice } from '~~/shared/dice/roll'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

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

    if (parsed.type === 'chat:send') {
      await handleChatSend(peer, parsed)
      return
    }

    if (parsed.type === 'move:request') {
      await handleMoveRequest(peer, parsed)
      return
    }

    if (parsed.type === 'chat:history-before') {
      await handleHistoryFetch(peer, parsed)
      return
    }
  },

  close(peer: Peer) {
    const info = registry.unregister(peer)
    if (!info) return
    const leftEvent: PlayerLeftEvent = {
      type: 'player:left',
      playerId: info.playerId
    }
    const leftPayload = JSON.stringify(leftEvent)
    for (const c of registry.listParty(info.partySeed)) {
      try {
        c.ws.send(leftPayload)
      } catch { /* skip */ }
    }
  }
})

async function handleChatSend(peer: Peer, raw: unknown) {
  const res = ChatSendEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'chat_send_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  if (!['say', 'emote', 'ooc', 'shout', 'whisper', 'dm', 'roll'].includes(res.data.kind)) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: `kind_${res.data.kind}_not_yet_implemented` })
    return
  }

  const rateKey = `${conn.partySeed}:${conn.playerId}`
  if (!chatRateLimiter.tryHit(rateKey)) {
    sendJson(peer, { type: 'error', code: 'rate_limited' })
    return
  }

  const db = useDb()
  const partyPlayers = listOnlinePlayers(db, conn.partySeed)
  const me = partyPlayers.find(p => p.id === conn.playerId)
  if (!me) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  const kind = res.data.kind
  let storedAreaId: string | null = null
  let targetPlayerId: string | null = null
  let body = res.data.body
  let rollPayload: string | null = null

  if (kind === 'dm') {
    const targetIdentifier = res.data.targetPlayerId ?? ''
    const target = partyPlayers.find(p => p.id === targetIdentifier || p.nickname.toLowerCase() === targetIdentifier.toLowerCase())
    if (!target) {
      sendJson(peer, { type: 'error', code: 'not_found', detail: 'target_not_found' })
      return
    }
    targetPlayerId = target.id
    storedAreaId = null
  } else if (kind === 'whisper') {
    const targetIdentifier = res.data.targetPlayerId ?? ''
    const target = partyPlayers.find(p => p.id === targetIdentifier || p.nickname.toLowerCase() === targetIdentifier.toLowerCase())
    if (!target) {
      sendJson(peer, { type: 'error', code: 'not_found', detail: 'target_not_found' })
      return
    }
    if (target.currentAreaId !== conn.areaId) {
      sendJson(peer, { type: 'error', code: 'forbidden', detail: 'target_not_in_area' })
      return
    }
    targetPlayerId = target.id
    storedAreaId = conn.areaId
  } else if (kind === 'roll') {
    const expr = res.data.rollExpr ?? ''
    const parsed = parseRoll(expr)
    if (!parsed.ok) {
      sendJson(peer, { type: 'error', code: 'bad_roll_expr', detail: parsed.error })
      return
    }
    const rng = mulberry32(seedFromString(`${conn.partySeed}|${conn.playerId}|${Date.now()}`))
    const rolled = rollDice(parsed.expr, rng)
    rollPayload = JSON.stringify({ expr, ...rolled })
    body = res.data.body || expr
    storedAreaId = conn.areaId
  } else {
    const areaId = res.data.areaId ?? conn.areaId
    if (!isAreaId(areaId)) {
      sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
      return
    }
    if (areaId !== conn.areaId) {
      sendJson(peer, { type: 'error', code: 'forbidden', detail: 'not_in_area' })
      return
    }
    storedAreaId = areaId
  }

  const stored = insertMessage(db, {
    partySeed: conn.partySeed,
    kind,
    authorPlayerId: conn.playerId,
    authorDisplay: me.nickname,
    areaId: storedAreaId,
    targetPlayerId,
    body,
    rollPayload
  })

  const broadcast: MessageNewEvent = { type: 'message:new', message: stored }
  const payload = JSON.stringify(broadcast)

  const roleById = new Map(partyPlayers.map(p => [p.id, p.role]))
  const roleAware = registry.listParty(conn.partySeed).map(c => ({
    ...c,
    role: (roleById.get(c.playerId) ?? 'user') as 'user' | 'master'
  }))
  const recipients = pickFanoutRecipients(roleAware, {
    kind,
    areaId: storedAreaId,
    authorPlayerId: conn.playerId,
    targetPlayerId
  })
  for (const r of recipients) {
    try {
      r.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMoveRequest(peer: Peer, raw: unknown) {
  const res = MoveRequestEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'move_request_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  const toAreaId = res.data.toAreaId
  if (!isAreaId(toAreaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }

  const db = useDb()
  const partyPlayers = listOnlinePlayers(db, conn.partySeed)
  const me = partyPlayers.find(p => p.id === conn.playerId)
  if (!me) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  const fromAreaId = conn.areaId
  if (fromAreaId === toAreaId) return // no-op

  const isMaster = me.role === 'master'

  // Non-master: valida adiacenza (isAreaId protegge il cast sotto)
  if (!isMaster && !areAdjacent(fromAreaId as never, toAreaId as never)) {
    sendJson(peer, { type: 'error', code: 'not_adjacent' })
    return
  }
  // Non-master: valida area non chiusa
  if (!isMaster && isAreaClosed(db, conn.partySeed, toAreaId)) {
    sendJson(peer, { type: 'error', code: 'area_closed' })
    return
  }

  updatePlayerArea(db, conn.playerId, toAreaId)
  registry.updateArea(conn.partySeed, conn.playerId, toAreaId)

  const moved: PlayerMovedEvent = {
    type: 'player:moved',
    playerId: conn.playerId,
    fromAreaId,
    toAreaId,
    teleported: false
  }
  const payload = JSON.stringify(moved)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }

  // Invia solo al mittente la history della nuova area per popolare la chat.
  const messages = listAreaMessages(db, conn.partySeed, toAreaId, 100)
  sendJson(peer, { type: 'area:entered', areaId: toAreaId, messages })
}

async function handleHistoryFetch(peer: Peer, raw: unknown) {
  const res = HistoryFetchEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'history_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  const db = useDb()
  const limit = Math.min(res.data.limit, 200)

  if (res.data.areaId) {
    const messagesBatch = listAreaMessagesBefore(db, conn.partySeed, res.data.areaId, res.data.before, limit)
    const hasMore = messagesBatch.length === limit
    const event: HistoryBatchEvent = {
      type: 'chat:history-batch',
      areaId: res.data.areaId,
      messages: messagesBatch,
      hasMore
    }
    sendJson(peer, event)
    return
  }

  if (res.data.threadKey) {
    const parts = res.data.threadKey.split('::')
    if (parts.length !== 2) {
      sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'bad_thread_key' })
      return
    }
    const [a, b] = parts as [string, string]
    // Restrizione: il conn deve essere una delle due parti (salvo master che può osservare)
    const partyPlayers = listOnlinePlayers(db, conn.partySeed)
    const me = partyPlayers.find(p => p.id === conn.playerId)
    const isMaster = me?.role === 'master'
    if (!isMaster && conn.playerId !== a && conn.playerId !== b) {
      sendJson(peer, { type: 'error', code: 'forbidden', detail: 'not_a_thread_party' })
      return
    }
    const messagesBatch = listThreadMessagesBefore(db, conn.partySeed, a, b, res.data.before, limit)
    const hasMore = messagesBatch.length === limit
    const event: HistoryBatchEvent = {
      type: 'chat:history-batch',
      threadKey: res.data.threadKey,
      messages: messagesBatch,
      hasMore
    }
    sendJson(peer, event)
    return
  }

  sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'missing_area_or_thread' })
}

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
    const dms = listRecentDmsForPlayer(db, seed, player.id, 50)

    const init: StateInitEvent = {
      type: 'state:init',
      me: { id: player.id, nickname: player.nickname, role: player.role, currentAreaId: player.currentAreaId },
      party: { seed: party.seed, cityName: party.cityName, createdAt: party.createdAt, lastActivityAt: party.lastActivityAt },
      players,
      areasState,
      messagesByArea: messagesByArea as never,
      dms,
      serverTime: Date.now()
    }
    sendJson(peer, init)
    touchPlayer(db, player.id)

    // Notifica agli altri player della party del nuovo arrivo.
    const joinEvent: PlayerJoinedEvent = {
      type: 'player:joined',
      player: { id: player.id, nickname: player.nickname, role: player.role, currentAreaId: player.currentAreaId }
    }
    const joinPayload = JSON.stringify(joinEvent)
    for (const c of registry.listParty(seed)) {
      if (c.ws === peer) continue // skip self
      try {
        c.ws.send(joinPayload)
      } catch { /* skip */ }
    }
  } catch (e) {
    sendJson(peer, { type: 'error', code: 'not_found', detail: (e as Error).message })
    peer.close(4004, 'not_found')
  }
}
