import { HelloEvent, ChatSendEvent, MoveRequestEvent, HistoryFetchEvent, MasterAreaEvent, MasterSpawnZombieEvent, MasterRemoveZombieEvent, MasterPlacePlayerEvent, MasterMoveZombieEvent, MasterSpawnZombiesEvent, VoiceOfferEvent, VoiceAnswerEvent, VoiceIceEvent, VoiceLeaveEvent, MasterDeleteMessageEvent, MasterEditMessageEvent, MasterMuteEvent, MasterUnmuteEvent, MasterKickEvent, MasterBanEvent, MasterUnbanEvent, MasterNpcEvent, MasterAnnounceEvent, MasterHiddenRollEvent, MasterWeatherOverrideEvent, MasterMovePlayerEvent, MasterFetchActionsEvent, MasterFetchBansEvent, type StateInitEvent, type TimeTickEvent, type MessageNewEvent, type PlayerMovedEvent, type PlayerJoinedEvent, type PlayerLeftEvent, type HistoryBatchEvent, type Zombie, type ZombieSpawnedEvent, type ZombieRemovedEvent, type PlayerPlacedEvent, type ZombieMovedEvent, type ZombiesBatchSpawnedEvent, type VoiceSignalEvent, type MessageUpdateEvent, type PlayerMutedEvent, type KickedEvent, type WeatherUpdatedEvent, type MasterActionsSnapshotEvent, type MasterBansSnapshotEvent, type TransitionPublic, type PartyMapPublic } from '~~/shared/protocol/ws'
import { useDb } from '~~/server/utils/db'
import { findPlayerByUserInParty, listOnlinePlayers, touchPlayer, updatePlayerArea, setMute, kickPlayer, findPlayerById, type PlayerRow } from '~~/server/services/players'
import { findSession, extendSession, revokeSession } from '~~/server/services/sessions'
import { findUserById } from '~~/server/services/users'
import { addBan, removeBan, listBans } from '~~/server/services/bans'
import { logMasterAction, listMasterActions } from '~~/server/services/master-actions'
import { setOverride, clearOverride, listOverrides } from '~~/server/services/weather-overrides'
import { partyMustExist } from '~~/server/services/parties'
import { listAreasState, updateAreaState, findAreaState } from '~~/server/services/areas'
import { listAreaMessages, insertMessage, listAreaMessagesBefore, listThreadMessagesBefore, listRecentDmsForPlayer, softDeleteMessage, editMessage, findMessage, type MessageRow } from '~~/server/services/messages'
import { registry, sendJson, chatRateLimiter, listPartyZombies, addZombie, removeZombie, moveZombie, addZombies, listPlayerPositions, setPlayerPosition, resetPlayerPosition, ensurePartyHydrated } from '~~/server/ws/state'
import { insertZombie, insertZombies, deleteZombie, updateZombiePosition } from '~~/server/services/zombies'
import { upsertPosition, deletePositionsForPlayer } from '~~/server/services/player-positions'
import { pickFanoutRecipients } from '~~/server/ws/fanout'
import { isAreaId, areAdjacent } from '~~/shared/map/areas'
import { isAreaClosed } from '~~/server/services/area-access'
import { listPartyMaps, findPartyMap } from '~~/server/services/party-maps'
import { listTransitionsForParty, findTransition } from '~~/server/services/map-transitions'
import { findMapType, parseDefaultParams } from '~~/server/services/map-types'
import { generate, type GeneratedMap } from '~~/shared/map/generators'
import { parseRoll } from '~~/shared/dice/parse'
import { rollDice } from '~~/shared/dice/roll'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'
import { generateUuid } from '~~/server/utils/crypto'

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
  // v2a: nitro crossws espone l'upgrade request su peer.request; leggiamo
  // il cookie gdr_session da lì per autenticare il WS.
  request?: { headers: { get(name: string): string | null } }
}

const SESSION_COOKIE_NAME = 'gdr_session'

// Estrae il valore del cookie gdr_session dall'upgrade request del peer.
// Ritorna null se header cookie mancante o cookie non presente.
function extractSessionCookie(peer: Peer): string | null {
  const raw = peer.request?.headers.get('cookie')
  if (!raw) return null
  const re = new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`)
  const m = raw.match(re)
  return m ? decodeURIComponent(m[1]!) : null
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
      await handleHello(peer, res.data.seed)
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

    if (parsed.type === 'master:area') {
      await handleMasterArea(peer, parsed)
      return
    }

    if (parsed.type === 'master:spawn-zombie') {
      await handleMasterSpawnZombie(peer, parsed)
      return
    }
    if (parsed.type === 'master:remove-zombie') {
      await handleMasterRemoveZombie(peer, parsed)
      return
    }

    if (parsed.type === 'master:place-player') {
      await handleMasterPlacePlayer(peer, parsed)
      return
    }

    if (parsed.type === 'master:move-zombie') {
      await handleMasterMoveZombie(peer, parsed)
      return
    }
    if (parsed.type === 'master:spawn-zombies') {
      await handleMasterSpawnZombies(peer, parsed)
      return
    }

    if (parsed.type === 'voice:offer' || parsed.type === 'voice:answer'
      || parsed.type === 'voice:ice' || parsed.type === 'voice:leave') {
      await handleVoiceSignal(peer, parsed)
      return
    }

    if (parsed.type === 'master:delete-message') {
      await handleMasterDeleteMessage(peer, parsed)
      return
    }
    if (parsed.type === 'master:edit-message') {
      await handleMasterEditMessage(peer, parsed)
      return
    }
    if (parsed.type === 'master:mute') {
      await handleMasterMute(peer, parsed)
      return
    }
    if (parsed.type === 'master:unmute') {
      await handleMasterUnmute(peer, parsed)
      return
    }
    if (parsed.type === 'master:kick') {
      await handleMasterKick(peer, parsed)
      return
    }
    if (parsed.type === 'master:ban') {
      await handleMasterBan(peer, parsed)
      return
    }
    if (parsed.type === 'master:unban') {
      await handleMasterUnban(peer, parsed)
      return
    }
    if (parsed.type === 'master:npc') {
      await handleMasterNpc(peer, parsed)
      return
    }
    if (parsed.type === 'master:announce') {
      await handleMasterAnnounce(peer, parsed)
      return
    }
    if (parsed.type === 'master:hidden-roll') {
      await handleMasterHiddenRoll(peer, parsed)
      return
    }
    if (parsed.type === 'master:weather-override') {
      await handleMasterWeatherOverride(peer, parsed)
      return
    }
    if (parsed.type === 'master:move-player') {
      await handleMasterMovePlayer(peer, parsed)
      return
    }
    if (parsed.type === 'master:fetch-actions') {
      await handleMasterFetchActions(peer, parsed)
      return
    }
    if (parsed.type === 'master:fetch-bans') {
      await handleMasterFetchBans(peer, parsed)
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

  if (me.isMuted) {
    if (me.mutedUntil && me.mutedUntil < Date.now()) {
      // unmute lazy
      setMute(db, me.id, false, null)
    } else {
      sendJson(peer, { type: 'error', code: 'muted' })
      return
    }
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

// v2d/T15: helper locale che genera (deterministica) la GeneratedMap di una
// partyMap data, per leggere adjacency lato server. Usata solo in handleMove.
// Nessuna cache aggiuntiva: il generators registry ha già una memoization.
function generateMapForPartyMap(db: ReturnType<typeof useDb>, mapId: string): GeneratedMap | null {
  const map = findPartyMap(db, mapId)
  if (!map) return null
  const mapType = findMapType(db, map.mapTypeId)
  if (!mapType) return null
  return generate(mapType.id, map.mapSeed, parseDefaultParams(mapType))
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
  // toMapId è opzionale; quando undefined indica intra-mappa.
  const reqToMapId = res.data.toMapId

  const db = useDb()
  const partyPlayers = listOnlinePlayers(db, conn.partySeed)
  const me = partyPlayers.find(p => p.id === conn.playerId)
  if (!me) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }

  const fromAreaId = conn.areaId
  const currentMapId = me.currentMapId ?? null
  const targetMapId = reqToMapId ?? currentMapId

  const isMaster = me.role === 'master'
  const sameMap = targetMapId === currentMapId

  // Caso A: stessa mappa. Se currentMapId è valorizzato e la party ha una
  // GeneratedMap, valida adiacenza/closed sul grafo della mappa. Altrimenti
  // ricade sul vecchio path hardcoded (party legacy pre-T17).
  if (sameMap) {
    if (fromAreaId === toAreaId) return // no-op

    if (currentMapId !== null) {
      // Path multi-mappa: usa GeneratedMap.adjacency.
      const gm = generateMapForPartyMap(db, currentMapId)
      if (!gm) {
        sendJson(peer, { type: 'error', code: 'map_not_found' })
        return
      }
      if (!gm.areas.some(a => a.id === toAreaId)) {
        sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
        return
      }

      if (!isMaster) {
        const adj = gm.adjacency[fromAreaId] ?? []
        if (!adj.includes(toAreaId)) {
          sendJson(peer, { type: 'error', code: 'not_adjacent' })
          return
        }
        // areasState filtrato per mapId: la riga è univoca per (party, area)
        // finché T16 non estende la PK; controlliamo entrambe le condizioni
        // (mapId NULL legacy o == currentMapId) per essere robusti.
        const areas = listAreasState(db, conn.partySeed)
        const targetState = areas.find((a) => {
          const aMapId = (a as { mapId?: string | null }).mapId ?? null
          return a.areaId === toAreaId && (aMapId === null || aMapId === currentMapId)
        })
        if (targetState && targetState.status === 'closed') {
          sendJson(peer, { type: 'error', code: 'area_closed', detail: 'area_status_closed' })
          return
        }
        if (isAreaClosed(db, conn.partySeed, toAreaId)) {
          sendJson(peer, { type: 'error', code: 'area_closed' })
          return
        }
      }
    } else {
      // Path legacy: AREAS hardcoded (parties senza mappe).
      if (!isAreaId(toAreaId)) {
        sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
        return
      }
      if (!isMaster) {
        const areas = listAreasState(db, conn.partySeed)
        const targetState = areas.find(a => a.areaId === toAreaId)
        if (targetState && targetState.status === 'closed') {
          sendJson(peer, { type: 'error', code: 'area_closed', detail: 'area_status_closed' })
          return
        }
        if (!areAdjacent(fromAreaId as never, toAreaId as never)) {
          sendJson(peer, { type: 'error', code: 'not_adjacent' })
          return
        }
        if (isAreaClosed(db, conn.partySeed, toAreaId)) {
          sendJson(peer, { type: 'error', code: 'area_closed' })
          return
        }
      }
    }

    // Update intra-mappa: NON tocca currentMapId.
    updatePlayerArea(db, conn.playerId, toAreaId)
    registry.updateArea(conn.partySeed, conn.playerId, toAreaId)

    const moved: PlayerMovedEvent = {
      type: 'player:moved',
      playerId: conn.playerId,
      fromAreaId,
      toAreaId,
      fromMapId: currentMapId,
      toMapId: currentMapId,
      teleported: false
    }
    const payload = JSON.stringify(moved)
    for (const c of registry.listParty(conn.partySeed)) {
      try {
        c.ws.send(payload)
      } catch { /* skip */ }
    }

    resetPlayerPosition(conn.partySeed, conn.playerId)
    deletePositionsForPlayer(db, conn.partySeed, conn.playerId)
    const resetEvent: PlayerPlacedEvent = {
      type: 'player:placed',
      playerId: conn.playerId,
      areaId: toAreaId,
      x: null,
      y: null
    }
    const resetPayload = JSON.stringify(resetEvent)
    for (const c of registry.listParty(conn.partySeed)) {
      try {
        c.ws.send(resetPayload)
      } catch { /* skip */ }
    }

    const messages = listAreaMessages(db, conn.partySeed, toAreaId, 100)
    sendJson(peer, { type: 'area:entered', areaId: toAreaId, messages })
    return
  }

  // Caso B: cross-map. Richiede currentMapId valorizzato (altrimenti il
  // client non può sensatamente specificare toMapId ≠ null).
  if (currentMapId === null || targetMapId === null) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'cross_map_requires_current_map' })
    return
  }

  // Verifica che la mappa di destinazione esista e appartenga alla party.
  const targetMap = findPartyMap(db, targetMapId)
  if (!targetMap || targetMap.partySeed !== conn.partySeed) {
    sendJson(peer, { type: 'error', code: 'map_not_found' })
    return
  }
  // Verifica che toAreaId esista nella GeneratedMap di destinazione.
  const targetGm = generateMapForPartyMap(db, targetMapId)
  if (!targetGm) {
    sendJson(peer, { type: 'error', code: 'map_not_found' })
    return
  }
  if (!targetGm.areas.some(a => a.id === toAreaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }

  // Cerca la transition esatta (currentMap, fromArea) → (target, toArea).
  const transition = findTransition(db, currentMapId, fromAreaId, targetMapId, toAreaId)
  if (!transition && !isMaster) {
    sendJson(peer, { type: 'error', code: 'not_a_transition' })
    return
  }

  // Update cross-map: aggiorna sia currentMapId sia currentAreaId.
  updatePlayerArea(db, conn.playerId, toAreaId, targetMapId)
  registry.updateArea(conn.partySeed, conn.playerId, toAreaId)

  const moved: PlayerMovedEvent = {
    type: 'player:moved',
    playerId: conn.playerId,
    fromAreaId,
    toAreaId,
    fromMapId: currentMapId,
    toMapId: targetMapId,
    teleported: false
  }
  const payload = JSON.stringify(moved)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }

  resetPlayerPosition(conn.partySeed, conn.playerId)
  deletePositionsForPlayer(db, conn.partySeed, conn.playerId)
  const resetEvent: PlayerPlacedEvent = {
    type: 'player:placed',
    playerId: conn.playerId,
    areaId: toAreaId,
    x: null,
    y: null
  }
  const resetPayload = JSON.stringify(resetEvent)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(resetPayload)
    } catch { /* skip */ }
  }

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

async function handleMasterArea(peer: Peer, raw: unknown) {
  const res = MasterAreaEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'master_area_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  const db = useDb()
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  if (me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return
  }
  if (!isAreaId(res.data.areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }

  updateAreaState(db, conn.partySeed, res.data.areaId, {
    status: res.data.status,
    customName: res.data.customName,
    notes: res.data.notes
  })
  const fresh = findAreaState(db, conn.partySeed, res.data.areaId)
  if (!fresh) return

  const event = {
    type: 'area:updated' as const,
    patch: {
      partySeed: fresh.partySeed,
      areaId: fresh.areaId,
      status: fresh.status,
      customName: fresh.customName,
      notes: fresh.notes
    }
  }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterSpawnZombie(peer: Peer, raw: unknown) {
  const res = MasterSpawnZombieEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'spawn_zombie_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  const db = useDb()
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me || me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return
  }
  if (!isAreaId(res.data.areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }

  const zombie: Zombie = {
    id: generateUuid(),
    partySeed: conn.partySeed,
    areaId: res.data.areaId,
    x: res.data.x,
    y: res.data.y,
    spawnedAt: Date.now(),
    npcName: res.data.npcName ?? null,
    npcRole: res.data.npcRole ?? null
  }
  addZombie(zombie)
  insertZombie(db, zombie)

  const event: ZombieSpawnedEvent = { type: 'zombie:spawned', zombie }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterRemoveZombie(peer: Peer, raw: unknown) {
  const res = MasterRemoveZombieEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'remove_zombie_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  const db = useDb()
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me || me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return
  }
  const removed = removeZombie(conn.partySeed, res.data.id)
  if (!removed) return
  deleteZombie(db, conn.partySeed, removed.id)

  const event: ZombieRemovedEvent = { type: 'zombie:removed', id: removed.id }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterPlacePlayer(peer: Peer, raw: unknown) {
  const res = MasterPlacePlayerEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'place_player_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return
  }
  const db = useDb()
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me || me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return
  }
  if (!isAreaId(res.data.areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }
  setPlayerPosition(conn.partySeed, res.data.playerId, res.data.areaId, res.data.x, res.data.y)
  upsertPosition(db, conn.partySeed, res.data.playerId, res.data.areaId, res.data.x, res.data.y)
  const event: PlayerPlacedEvent = {
    type: 'player:placed',
    playerId: res.data.playerId,
    areaId: res.data.areaId,
    x: res.data.x,
    y: res.data.y
  }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterMoveZombie(peer: Peer, raw: unknown) {
  const res = MasterMoveZombieEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'move_zombie_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) return
  const db = useDb()
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me || me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return
  }
  const z = moveZombie(conn.partySeed, res.data.id, res.data.x, res.data.y)
  if (!z) return
  updateZombiePosition(db, conn.partySeed, z.id, z.x, z.y)
  const event: ZombieMovedEvent = { type: 'zombie:moved', id: z.id, x: z.x, y: z.y }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterSpawnZombies(peer: Peer, raw: unknown) {
  const res = MasterSpawnZombiesEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'spawn_zombies_malformed' })
    return
  }
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) return
  const db = useDb()
  const me = listOnlinePlayers(db, conn.partySeed).find(p => p.id === conn.playerId)
  if (!me || me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return
  }
  if (!isAreaId(res.data.areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }
  const now = Date.now()
  const newZombies: Zombie[] = res.data.positions.map(pos => ({
    id: generateUuid(),
    partySeed: conn.partySeed,
    areaId: res.data.areaId,
    x: pos.x,
    y: pos.y,
    spawnedAt: now
  }))
  addZombies(newZombies)
  insertZombies(db, newZombies)
  const event: ZombiesBatchSpawnedEvent = { type: 'zombies:batch-spawned', zombies: newZombies }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleVoiceSignal(peer: Peer, raw: Record<string, unknown>) {
  let targetPlayerId: string | null = null
  let signal: VoiceSignalEvent['signal'] | null = null

  if (raw.type === 'voice:offer') {
    const r = VoiceOfferEvent.safeParse(raw)
    if (!r.success) return
    targetPlayerId = r.data.targetPlayerId
    signal = { kind: 'offer', sdp: r.data.sdp }
  } else if (raw.type === 'voice:answer') {
    const r = VoiceAnswerEvent.safeParse(raw)
    if (!r.success) return
    targetPlayerId = r.data.targetPlayerId
    signal = { kind: 'answer', sdp: r.data.sdp }
  } else if (raw.type === 'voice:ice') {
    const r = VoiceIceEvent.safeParse(raw)
    if (!r.success) return
    targetPlayerId = r.data.targetPlayerId
    signal = { kind: 'ice', candidate: r.data.candidate }
  } else if (raw.type === 'voice:leave') {
    const r = VoiceLeaveEvent.safeParse(raw)
    if (!r.success) return
    targetPlayerId = r.data.targetPlayerId
    signal = { kind: 'leave' }
  }

  if (!targetPlayerId || !signal) return

  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) return
  const targetConn = registry.getPlayerConn(conn.partySeed, targetPlayerId)
  if (!targetConn) return

  const event: VoiceSignalEvent = {
    type: 'voice:signal',
    fromPlayerId: conn.playerId,
    signal
  }
  try {
    targetConn.ws.send(JSON.stringify(event))
  } catch { /* skip */ }
}

function requireMaster(peer: Peer): { db: ReturnType<typeof useDb>, conn: ReturnType<typeof registry.all>[number], me: PlayerRow } | null {
  const conn = registry.all().find(c => c.ws === peer)
  if (!conn) {
    sendJson(peer, { type: 'error', code: 'session_invalid' })
    return null
  }
  const db = useDb()
  const me = findPlayerById(db, conn.partySeed, conn.playerId)
  if (!me || me.role !== 'master') {
    sendJson(peer, { type: 'error', code: 'master_only' })
    return null
  }
  return { db, conn, me }
}

async function handleMasterDeleteMessage(peer: Peer, raw: unknown) {
  const res = MasterDeleteMessageEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const msg = findMessage(ctx.db, res.data.messageId)
  if (!msg || msg.partySeed !== ctx.conn.partySeed) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  softDeleteMessage(ctx.db, res.data.messageId, ctx.me.id)
  logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'delete', target: res.data.messageId })
  const updated = findMessage(ctx.db, res.data.messageId)
  if (!updated) return
  const event: MessageUpdateEvent = { type: 'message:update', message: updated }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterEditMessage(peer: Peer, raw: unknown) {
  const res = MasterEditMessageEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const prev = findMessage(ctx.db, res.data.messageId)
  if (!prev || prev.partySeed !== ctx.conn.partySeed) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  editMessage(ctx.db, res.data.messageId, res.data.newBody)
  logMasterAction(ctx.db, {
    partySeed: ctx.conn.partySeed,
    masterId: ctx.me.id,
    action: 'edit',
    target: res.data.messageId,
    payload: { previousBody: prev.body }
  })
  const updated = findMessage(ctx.db, res.data.messageId)
  if (!updated) return
  const event: MessageUpdateEvent = { type: 'message:update', message: updated }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterMute(peer: Peer, raw: unknown) {
  const res = MasterMuteEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const target = findPlayerById(ctx.db, ctx.conn.partySeed, res.data.playerId)
  if (!target) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  if (target.id === ctx.me.id) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: 'cannot_mute_self' })
    return
  }
  if (target.role === 'master') {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: 'cannot_mute_master' })
    return
  }
  const until = res.data.minutes != null ? Date.now() + res.data.minutes * 60 * 1000 : null
  setMute(ctx.db, target.id, true, until)
  logMasterAction(ctx.db, {
    partySeed: ctx.conn.partySeed,
    masterId: ctx.me.id,
    action: 'mute',
    target: target.id,
    payload: { minutes: res.data.minutes }
  })
  const event: PlayerMutedEvent = { type: 'player:muted', playerId: target.id, muted: true, mutedUntil: until }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterUnmute(peer: Peer, raw: unknown) {
  const res = MasterUnmuteEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const target = findPlayerById(ctx.db, ctx.conn.partySeed, res.data.playerId)
  if (!target) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  setMute(ctx.db, target.id, false, null)
  logMasterAction(ctx.db, {
    partySeed: ctx.conn.partySeed,
    masterId: ctx.me.id,
    action: 'unmute',
    target: target.id
  })
  const event: PlayerMutedEvent = { type: 'player:muted', playerId: target.id, muted: false, mutedUntil: null }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

function disconnectPlayer(partySeed: string, playerId: string, reason: string | null) {
  const conn = registry.getPlayerConn(partySeed, playerId)
  if (!conn) return
  const kickedEv: KickedEvent = { type: 'kicked', reason }
  try {
    conn.ws.send(JSON.stringify(kickedEv))
  } catch { /* skip */ }
  try {
    conn.ws.close(4002, 'kicked')
  } catch { /* skip */ }
  registry.unregister(conn.ws)
  const leftEv: PlayerLeftEvent = { type: 'player:left', playerId, reason: reason ?? undefined }
  const leftPayload = JSON.stringify(leftEv)
  for (const c of registry.listParty(partySeed)) {
    try {
      c.ws.send(leftPayload)
    } catch { /* skip */ }
  }
}

async function handleMasterKick(peer: Peer, raw: unknown) {
  const res = MasterKickEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const target = findPlayerById(ctx.db, ctx.conn.partySeed, res.data.playerId)
  if (!target) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  if (target.id === ctx.me.id) {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: 'cannot_kick_self' })
    return
  }
  if (target.role === 'master') {
    sendJson(peer, { type: 'error', code: 'forbidden', detail: 'cannot_kick_master' })
    return
  }
  kickPlayer(ctx.db, target.id)
  logMasterAction(ctx.db, {
    partySeed: ctx.conn.partySeed,
    masterId: ctx.me.id,
    action: 'kick',
    target: target.id,
    payload: { reason: res.data.reason ?? null }
  })
  disconnectPlayer(ctx.conn.partySeed, target.id, res.data.reason ?? null)
}

async function handleMasterBan(peer: Peer, raw: unknown) {
  const res = MasterBanEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const target = findPlayerById(ctx.db, ctx.conn.partySeed, res.data.playerId)
  if (!target) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  if (target.id === ctx.me.id || target.role === 'master') {
    sendJson(peer, { type: 'error', code: 'forbidden' })
    return
  }
  kickPlayer(ctx.db, target.id)
  addBan(ctx.db, ctx.conn.partySeed, target.nickname.toLowerCase(), res.data.reason ?? null)
  logMasterAction(ctx.db, {
    partySeed: ctx.conn.partySeed,
    masterId: ctx.me.id,
    action: 'ban',
    target: target.id,
    payload: { reason: res.data.reason ?? null, nickname: target.nickname }
  })
  disconnectPlayer(ctx.conn.partySeed, target.id, res.data.reason ?? null)
}

async function handleMasterUnban(peer: Peer, raw: unknown) {
  const res = MasterUnbanEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  removeBan(ctx.db, ctx.conn.partySeed, res.data.nicknameLower.toLowerCase())
  logMasterAction(ctx.db, {
    partySeed: ctx.conn.partySeed,
    masterId: ctx.me.id,
    action: 'unban',
    target: res.data.nicknameLower
  })
}

async function handleMasterNpc(peer: Peer, raw: unknown) {
  const res = MasterNpcEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  if (!isAreaId(res.data.areaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }

  const stored = insertMessage(ctx.db, {
    partySeed: ctx.conn.partySeed,
    kind: 'npc',
    authorPlayerId: ctx.me.id,
    authorDisplay: res.data.npcName,
    areaId: res.data.areaId,
    body: res.data.body
  })
  logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'npc', target: res.data.areaId, payload: { npcName: res.data.npcName } })

  const event: MessageNewEvent = { type: 'message:new', message: stored }
  const payload = JSON.stringify(event)
  const partyPlayers = listOnlinePlayers(ctx.db, ctx.conn.partySeed)
  const roleById = new Map(partyPlayers.map(p => [p.id, p.role]))
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    const role = roleById.get(c.playerId) ?? 'user'
    if (role === 'master' || c.areaId === res.data.areaId) {
      try {
        c.ws.send(payload)
      } catch { /* skip */ }
    }
  }
}

async function handleMasterAnnounce(peer: Peer, raw: unknown) {
  const res = MasterAnnounceEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const stored = insertMessage(ctx.db, {
    partySeed: ctx.conn.partySeed,
    kind: 'announce',
    authorPlayerId: ctx.me.id,
    authorDisplay: ctx.me.nickname,
    areaId: null,
    body: res.data.body
  })
  logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'announce', payload: { body: res.data.body } })
  const event: MessageNewEvent = { type: 'message:new', message: stored }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterHiddenRoll(peer: Peer, raw: unknown) {
  const res = MasterHiddenRollEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const parsedRoll = parseRoll(res.data.expr)
  if (!parsedRoll.ok) {
    sendJson(peer, { type: 'error', code: 'bad_roll_expr', detail: parsedRoll.error })
    return
  }
  const rng = mulberry32(seedFromString(`${ctx.conn.partySeed}|${ctx.me.id}|${Date.now()}|hidden`))
  const rolled = rollDice(parsedRoll.expr, rng)
  const stored = insertMessage(ctx.db, {
    partySeed: ctx.conn.partySeed,
    kind: 'roll',
    authorPlayerId: ctx.me.id,
    authorDisplay: ctx.me.nickname,
    areaId: null,
    body: res.data.expr,
    rollPayload: JSON.stringify({ expr: res.data.expr, ...rolled })
  })
  logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'hidden-roll', payload: { expr: res.data.expr, total: rolled.total } })
  const event: MessageNewEvent = { type: 'message:new', message: stored }
  const sendPayload = JSON.stringify(event)
  const conn = registry.getPlayerConn(ctx.conn.partySeed, ctx.me.id)
  if (conn) {
    try {
      conn.ws.send(sendPayload)
    } catch { /* skip */ }
  }
}

async function handleMasterWeatherOverride(peer: Peer, raw: unknown) {
  const res = MasterWeatherOverrideEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const targetArea = res.data.areaId
  if (targetArea !== null && !isAreaId(targetArea)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }
  if (res.data.clear) {
    clearOverride(ctx.db, ctx.conn.partySeed, targetArea)
    logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'weather-clear', target: targetArea ?? '*' })
    const event: WeatherUpdatedEvent = { type: 'weather:updated', areaId: targetArea, effective: null }
    const payload = JSON.stringify(event)
    for (const c of registry.listParty(ctx.conn.partySeed)) {
      try {
        c.ws.send(payload)
      } catch { /* skip */ }
    }
    return
  }
  if (!res.data.code) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'missing_code' })
    return
  }
  const intensity = res.data.intensity ?? 0.7
  setOverride(ctx.db, ctx.conn.partySeed, targetArea, res.data.code, intensity)
  logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'weather-set', target: targetArea ?? '*', payload: { code: res.data.code, intensity } })
  const event: WeatherUpdatedEvent = {
    type: 'weather:updated',
    areaId: targetArea,
    effective: { code: res.data.code, intensity, label: res.data.code }
  }
  const payload = JSON.stringify(event)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(payload)
    } catch { /* skip */ }
  }
}

async function handleMasterMovePlayer(peer: Peer, raw: unknown) {
  const res = MasterMovePlayerEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  if (!isAreaId(res.data.toAreaId)) {
    sendJson(peer, { type: 'error', code: 'invalid_payload', detail: 'unknown_area' })
    return
  }
  const target = findPlayerById(ctx.db, ctx.conn.partySeed, res.data.playerId)
  if (!target) {
    sendJson(peer, { type: 'error', code: 'not_found' })
    return
  }
  const fromAreaId = target.currentAreaId
  if (fromAreaId === res.data.toAreaId) return

  updatePlayerArea(ctx.db, target.id, res.data.toAreaId)
  registry.updateArea(ctx.conn.partySeed, target.id, res.data.toAreaId)
  resetPlayerPosition(ctx.conn.partySeed, target.id)
  deletePositionsForPlayer(ctx.db, ctx.conn.partySeed, target.id)
  logMasterAction(ctx.db, { partySeed: ctx.conn.partySeed, masterId: ctx.me.id, action: 'teleport', target: target.id, payload: { from: fromAreaId, to: res.data.toAreaId } })

  const moved: PlayerMovedEvent = {
    type: 'player:moved',
    playerId: target.id,
    fromAreaId,
    toAreaId: res.data.toAreaId,
    teleported: true
  }
  const movedPayload = JSON.stringify(moved)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(movedPayload)
    } catch { /* skip */ }
  }

  const reset: PlayerPlacedEvent = { type: 'player:placed', playerId: target.id, areaId: res.data.toAreaId, x: null, y: null }
  const resetPayload = JSON.stringify(reset)
  for (const c of registry.listParty(ctx.conn.partySeed)) {
    try {
      c.ws.send(resetPayload)
    } catch { /* skip */ }
  }

  const targetConn = registry.getPlayerConn(ctx.conn.partySeed, target.id)
  if (targetConn) {
    const messages = listAreaMessages(ctx.db, ctx.conn.partySeed, res.data.toAreaId, 100)
    try {
      targetConn.ws.send(JSON.stringify({ type: 'area:entered', areaId: res.data.toAreaId, messages }))
    } catch { /* skip */ }
  }
}

async function handleMasterFetchActions(peer: Peer, raw: unknown) {
  const res = MasterFetchActionsEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const actions = listMasterActions(ctx.db, ctx.conn.partySeed, res.data.limit)
  const event: MasterActionsSnapshotEvent = { type: 'master:actions-snapshot', actions }
  sendJson(peer, event)
}

async function handleMasterFetchBans(peer: Peer, raw: unknown) {
  const res = MasterFetchBansEvent.safeParse(raw)
  if (!res.success) {
    sendJson(peer, { type: 'error', code: 'invalid_payload' })
    return
  }
  const ctx = requireMaster(peer)
  if (!ctx) return
  const bans = listBans(ctx.db, ctx.conn.partySeed)
  const event: MasterBansSnapshotEvent = { type: 'master:bans-snapshot', bans }
  sendJson(peer, event)
}

async function handleHello(peer: Peer, seed: string) {
  try {
    const db = useDb()
    const party = partyMustExist(db, seed)

    // v2a: autenticazione via cookie gdr_session letto all'upgrade.
    const token = extractSessionCookie(peer)
    if (!token) {
      sendJson(peer, { type: 'error', code: 'session_expired' })
      peer.close(4001, 'session_expired')
      return
    }
    const session = findSession(db, token)
    if (!session || !session.userId) {
      sendJson(peer, { type: 'error', code: 'session_expired' })
      peer.close(4001, 'session_expired')
      return
    }
    extendSession(db, token)
    const user = findUserById(db, session.userId)
    if (!user || user.status !== 'approved') {
      revokeSession(db, token)
      sendJson(peer, { type: 'error', code: 'session_expired' })
      peer.close(4001, 'session_expired')
      return
    }

    const player = findPlayerByUserInParty(db, seed, user.id)
    if (!player) {
      sendJson(peer, { type: 'error', code: 'not_member' })
      peer.close(4003, 'not_member')
      return
    }

    registry.register(peer, {
      partySeed: seed,
      playerId: player.id,
      areaId: player.currentAreaId
    })

    // Lazy-hydrate lo stato in-memory (zombi + posizioni) dal DB la prima
    // volta che qualcuno contatta questa party dopo il boot server.
    ensurePartyHydrated(db, seed)

    const players = listOnlinePlayers(db, seed).map(p => ({
      id: p.id, nickname: p.nickname, role: p.role,
      currentAreaId: p.currentAreaId,
      currentMapId: p.currentMapId ?? null
    }))
    const areasState = listAreasState(db, seed).map(a => ({
      ...a,
      // v2d: T14 ha reso mapId nullable.optional sullo schema. Lo scrive
      // esplicitamente per chiarezza; T16 valorizzerà sempre la coppia.
      mapId: (a as { mapId?: string | null }).mapId ?? null
    }))
    const messagesByArea: Record<string, MessageRow[]> = {}
    messagesByArea[player.currentAreaId] = listAreaMessages(db, seed, player.currentAreaId, 100)
    const dms = listRecentDmsForPlayer(db, seed, player.id, 50)
    const zombies = listPartyZombies(seed).map(z => ({
      ...z,
      mapId: z.mapId ?? null
    }))
    const playerPositions = listPlayerPositions(seed).map(p => ({
      ...p,
      mapId: p.mapId ?? null
    }))
    const weatherOverridesList = listOverrides(db, seed).map(w => ({
      ...w,
      mapId: (w as { mapId?: string | null }).mapId ?? null
    }))

    // v2d/T15: maps + transitions della party. Per party legacy senza mappe
    // (T17 non ancora applicato) i due array sono vuoti — il client deve
    // restare retrocompatibile.
    const allMaps = listPartyMaps(db, seed)
    const mapsPublic: PartyMapPublic[] = allMaps.map(m => ({
      id: m.id,
      mapTypeId: m.mapTypeId,
      name: m.name,
      isSpawn: m.isSpawn,
      createdAt: m.createdAt
    }))
    const transitionsPublic: TransitionPublic[] = listTransitionsForParty(db, seed).map(t => ({
      id: t.id,
      fromMapId: t.fromMapId,
      fromAreaId: t.fromAreaId,
      toMapId: t.toMapId,
      toAreaId: t.toAreaId,
      label: t.label
    }))

    const init: StateInitEvent = {
      type: 'state:init',
      me: {
        id: player.id, nickname: player.nickname, role: player.role,
        currentAreaId: player.currentAreaId,
        currentMapId: player.currentMapId ?? null
      },
      party: { seed: party.seed, cityName: party.cityName, createdAt: party.createdAt, lastActivityAt: party.lastActivityAt },
      players,
      areasState,
      messagesByArea: messagesByArea as never,
      dms,
      zombies,
      playerPositions,
      weatherOverrides: weatherOverridesList,
      maps: mapsPublic,
      transitions: transitionsPublic,
      serverTime: Date.now()
    }
    sendJson(peer, init)
    touchPlayer(db, player.id)

    // Notifica agli altri player della party del nuovo arrivo.
    const joinEvent: PlayerJoinedEvent = {
      type: 'player:joined',
      player: {
        id: player.id, nickname: player.nickname, role: player.role,
        currentAreaId: player.currentAreaId,
        currentMapId: player.currentMapId ?? null
      }
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
