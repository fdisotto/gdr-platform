import { ref, type Ref } from 'vue'
import { usePartyStore, type MeSnapshot, type PartySnapshot, type PlayerSnapshot, type AreaStateSnapshot } from '~/stores/party'
import { useChatStore, type ChatMessage } from '~/stores/chat'
import { useServerTime } from '~/composables/useServerTime'
import { useZombiesStore } from '~/stores/zombies'
import { usePlayerPositionsStore } from '~/stores/player-positions'
import { useWeatherOverridesStore } from '~/stores/weather-overrides'
import { useViewStore } from '~/stores/view'
import { playNotificationSound } from '~/composables/useNotificationSound'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { useFeedbackStore } from '~/stores/feedback'
import { useCrossPartyNotifications } from '~/composables/useCrossPartyNotifications'
import type { Zombie, PlayerPosition } from '~~/shared/protocol/ws'

export type PartyConnectionStatus = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

export interface PartyConnection {
  seed: string
  ws: Ref<WebSocket | null>
  status: Ref<PartyConnectionStatus>
  pendingQueue: Ref<Record<string, unknown>[]>
  reconnectAt: Ref<number | null>
  reconnectAttempts: Ref<number>
  notMember: Ref<boolean>
  send(event: Record<string, unknown>): void
  retryNow(): void
  // close imperativo: tipicamente chiamato dal factory.close(seed); esposto
  // perché serve a flussi specifici (logout, archiviazione party).
  close(): void
}

const connections = new Map<string, PartyConnection>()

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/party`
}

function makeConnection(seed: string): PartyConnection {
  const ws: Ref<WebSocket | null> = ref(null)
  const status: Ref<PartyConnectionStatus> = ref('idle')
  const pendingQueue: Ref<Record<string, unknown>[]> = ref([])
  const reconnectAt: Ref<number | null> = ref(null)
  const reconnectAttempts: Ref<number> = ref(0)
  const notMember: Ref<boolean> = ref(false)
  let closedFlag = false
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null

  // Store keyed-by-seed: ogni connection scrive sulla propria slice di
  // stato isolata. `serverTime`, `errorFeedback`, `feedbackStore` restano
  // singleton perché modellano stato globale dell'app.
  const partyStore = usePartyStore(seed)
  const chatStore = useChatStore(seed)
  const serverTime = useServerTime()
  const zombiesStore = useZombiesStore(seed)
  const playerPositionsStore = usePlayerPositionsStore(seed)
  const weatherOverridesStore = useWeatherOverridesStore(seed)
  const viewStore = useViewStore(seed)
  const errorFeedback = useErrorFeedback()
  const feedbackStore = useFeedbackStore()
  const crossNotif = useCrossPartyNotifications()

  function scheduleReconnect() {
    if (closedFlag) return
    reconnectAttempts.value++
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempts.value, 5))
    status.value = 'reconnecting'
    reconnectAt.value = Date.now() + delay
    if (reconnectTimer) clearTimeout(reconnectTimer)
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      reconnectAt.value = null
      if (!closedFlag) openSocket()
    }, delay)
  }

  function retryNow() {
    if (closedFlag) return
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    reconnectAt.value = null
    openSocket()
  }

  function openSocket() {
    if (
      ws.value
      && (status.value === 'connecting' || status.value === 'open')
    ) {
      return
    }
    closedFlag = false
    notMember.value = false
    status.value = 'connecting'
    const sock = new WebSocket(wsUrl())
    ws.value = sock

    sock.addEventListener('open', () => {
      reconnectAttempts.value = 0
      reconnectAt.value = null
      status.value = 'open'
      // v2a: niente sessionToken, il server autentica via cookie gdr_session
      sock.send(JSON.stringify({ type: 'hello', seed }))
      if (pendingQueue.value.length > 0) {
        const toFlush = pendingQueue.value
        pendingQueue.value = []
        setTimeout(() => {
          for (const ev of toFlush) {
            if (ws.value && ws.value.readyState === WebSocket.OPEN) {
              ws.value.send(JSON.stringify(ev))
            }
          }
        }, 200)
      }
    })

    sock.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>
        handleEvent(data)
      } catch { /* ignore malformed */ }
    })

    sock.addEventListener('close', (ev) => {
      ws.value = null
      // 4003 = not_member: niente reconnect, esponi flag
      if (ev.code === 4003) {
        notMember.value = true
        closedFlag = true
        status.value = 'closed'
        return
      }
      // 4004 = archived (party archiviata dal master o auto-archive plugin):
      // niente reconnect, mostriamo blocking + redirect /. Lo facciamo solo
      // se questa party era in primo piano, altrimenti chiudiamo silente.
      if (ev.code === 4004) {
        closedFlag = true
        status.value = 'closed'
        const fg = (typeof window !== 'undefined')
          ? window.location.pathname.match(/^\/party\/([^/]+)/)?.[1] ?? null
          : null
        if (fg === seed) {
          errorFeedback.reportError('archived')
        }
        return
      }
      if (!closedFlag) scheduleReconnect()
      else status.value = 'closed'
    })

    sock.addEventListener('error', () => {
      try {
        sock.close()
      } catch { /* no-op */ }
    })
  }

  function send(event: Record<string, unknown>) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(event))
      return
    }
    if (status.value === 'reconnecting' || status.value === 'connecting') {
      pendingQueue.value = [...pendingQueue.value, event]
    }
  }

  function close() {
    closedFlag = true
    status.value = 'closed'
    ws.value?.close()
    ws.value = null
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
    pendingQueue.value = []
    reconnectAttempts.value = 0
    reconnectAt.value = null
  }

  function handleEvent(data: Record<string, unknown>) {
    switch (data.type) {
      case 'state:init': {
        const init = data as unknown as {
          me: MeSnapshot & { currentMapId?: string | null }
          party: PartySnapshot
          players: PlayerSnapshot[]
          areasState: AreaStateSnapshot[]
          messagesByArea: Record<string, ChatMessage[]>
          dms: ChatMessage[]
          zombies: Zombie[]
          playerPositions: PlayerPosition[]
          weatherOverrides: { areaId: string | null, code: string, intensity: number }[]
          // v2d: state-init multi-mappa.
          maps?: Array<{ id: string, mapTypeId: string, mapSeed: string, name: string, isSpawn: boolean, createdAt: number, params?: Record<string, unknown> }>
          transitions?: Array<{ id: string, fromMapId: string, fromAreaId: string, toMapId: string, toAreaId: string, label: string | null }>
          areaOverrides?: import('~~/shared/protocol/ws').AreaOverridePublic[]
          adjacencyOverrides?: import('~~/shared/protocol/ws').AdjacencyOverridePublic[]
          visitedAreas?: import('~~/shared/protocol/ws').AreaVisitPublic[]
          serverTime: number
        }
        partyStore.hydrate({
          me: init.me,
          party: init.party,
          players: init.players,
          areasState: init.areasState,
          maps: init.maps ?? [],
          transitions: init.transitions ?? [],
          currentMapId: init.me.currentMapId ?? null,
          areaOverrides: init.areaOverrides ?? [],
          adjacencyOverrides: init.adjacencyOverrides ?? [],
          visitedAreas: init.visitedAreas ?? []
        })
        chatStore.hydrate(init.messagesByArea ?? {})
        chatStore.hydrateDms(init.dms ?? [], init.me.id)
        zombiesStore.hydrate(init.zombies ?? [])
        playerPositionsStore.hydrate(init.playerPositions ?? [])
        weatherOverridesStore.hydrate(init.weatherOverrides ?? [])
        serverTime.sync(init.serverTime)
        break
      }
      case 'message:new': {
        const m = (data as { message: ChatMessage }).message
        if (m.kind === 'dm' && partyStore.me) {
          chatStore.appendDm(m, partyStore.me.id)
        } else {
          chatStore.append(m)
        }
        const fromOther = partyStore.me && m.authorPlayerId && m.authorPlayerId !== partyStore.me.id
        if (fromOther && m.kind !== 'system') {
          const isDirectToMe = m.kind === 'dm'
            || (m.kind === 'whisper' && m.targetPlayerId === partyStore.me!.id)
          // Foreground vs background: se la party del messaggio NON è in
          // primo piano, deleghiamo a useCrossPartyNotifications per
          // gestire toast + suoni + counter. Se è in primo piano, gestiamo
          // qui suono + bump del badge "chat collapsed".
          const fg = (typeof window !== 'undefined')
            ? window.location.pathname.match(/^\/party\/([^/]+)/)?.[1] ?? null
            : null
          if (fg !== seed) {
            const cityName = partyStore.party?.cityName
            if (isDirectToMe) {
              crossNotif.bumpDirect(seed, cityName, m.authorDisplay)
            } else {
              crossNotif.bumpUnread(seed, cityName)
            }
          } else {
            playNotificationSound(isDirectToMe ? 'dm' : 'msg')
            if (viewStore.chatCollapsed && m.kind !== 'dm') {
              viewStore.bumpUnreadIfCollapsed()
            }
          }
        }
        break
      }
      case 'message:update': {
        const m = (data as { message: ChatMessage }).message
        chatStore.update(m)
        break
      }
      case 'message:removed': {
        const { messageId } = data as { messageId: string }
        chatStore.remove(messageId)
        break
      }
      case 'area-override:updated': {
        const { override } = data as { override: import('~~/shared/protocol/ws').AreaOverridePublic }
        partyStore.applyOverride(override)
        break
      }
      case 'area-override:removed': {
        const { mapId, areaId } = data as { mapId: string, areaId: string }
        partyStore.removeOverride(mapId, areaId)
        break
      }
      case 'adjacency-override:updated': {
        const { override } = data as { override: import('~~/shared/protocol/ws').AdjacencyOverridePublic }
        partyStore.applyAdjacencyOverride(override)
        break
      }
      case 'adjacency-override:removed': {
        const { mapId, areaA, areaB } = data as { mapId: string, areaA: string, areaB: string }
        partyStore.removeAdjacencyOverride(mapId, areaA, areaB)
        break
      }
      case 'area:discovered': {
        const { mapId, areaId } = data as { mapId: string, areaId: string }
        partyStore.markAreaDiscovered(mapId, areaId)
        break
      }
      case 'party:fog-changed': {
        const { enabled } = data as { enabled: boolean }
        partyStore.setFogEnabled(enabled)
        break
      }
      case 'time:tick': {
        serverTime.sync((data as { serverTime: number }).serverTime)
        break
      }
      case 'player:joined': {
        const payload = data as { player: PlayerSnapshot }
        if (partyStore.players.some(p => p.id === payload.player.id)) break
        partyStore.players = [...partyStore.players, payload.player]
        break
      }
      case 'player:left': {
        const payload = data as { playerId: string }
        partyStore.players = partyStore.players.filter(p => p.id !== payload.playerId)
        break
      }
      case 'player:moved': {
        const payload = data as {
          playerId: string
          toAreaId: string
          fromAreaId: string
          // v2d: per cross-map move il server include toMapId/fromMapId.
          // Per intra-map il server può comunque mandarli (entrambi pari al
          // currentMapId del player) oppure null in legacy. null/undefined
          // → invariante: la mappa corrente non cambia.
          toMapId?: string | null
          fromMapId?: string | null
          teleported: boolean
        }
        partyStore.players = partyStore.players.map(p =>
          p.id === payload.playerId ? { ...p, currentAreaId: payload.toAreaId } : p
        )
        if (partyStore.me && partyStore.me.id === payload.playerId) {
          partyStore.me = {
            ...partyStore.me,
            currentAreaId: payload.toAreaId,
            currentMapId: payload.toMapId ?? partyStore.me.currentMapId ?? null
          }
          // Tieni allineato anche il top-level currentMapId del party store
          // (usato da usePartyMaps.activeMap che pilota MapView).
          if (payload.toMapId) {
            partyStore.currentMapId = payload.toMapId
          }
        }
        playerPositionsStore.resetForPlayer(payload.playerId)
        break
      }
      case 'player:placed': {
        const p = data as { playerId: string, areaId: string, x: number | null, y: number | null }
        playerPositionsStore.set(p.playerId, p.areaId, p.x, p.y)
        break
      }
      case 'area:entered': {
        const payload = data as { areaId: string, messages: ChatMessage[] }
        chatStore.messagesByArea[payload.areaId] = payload.messages
        break
      }
      case 'chat:history-batch': {
        const payload = data as { areaId?: string, threadKey?: string, messages: ChatMessage[], hasMore: boolean }
        if (payload.areaId) {
          chatStore.prependArea(payload.areaId, payload.messages, payload.hasMore)
        } else if (payload.threadKey) {
          chatStore.prependThread(payload.threadKey, payload.messages, payload.hasMore)
        }
        break
      }
      case 'zombie:spawned': {
        const z = (data as { zombie: Zombie }).zombie
        zombiesStore.add(z)
        break
      }
      case 'zombie:removed': {
        const id = (data as { id: string }).id
        zombiesStore.remove(id)
        break
      }
      case 'zombie:moved': {
        const p = data as { id: string, x: number, y: number }
        zombiesStore.move(p.id, p.x, p.y)
        break
      }
      case 'zombies:batch-spawned': {
        const p = data as { zombies: Zombie[] }
        zombiesStore.addBatch(p.zombies)
        break
      }
      case 'area:updated': {
        const payload = data as { patch: AreaStateSnapshot }
        const idx = partyStore.areasState.findIndex(a => a.areaId === payload.patch.areaId)
        if (idx >= 0) {
          const copy = [...partyStore.areasState]
          copy[idx] = payload.patch
          partyStore.areasState = copy
        } else {
          partyStore.areasState = [...partyStore.areasState, payload.patch]
        }
        break
      }
      case 'player:muted': {
        const p = data as { playerId: string, muted: boolean, mutedUntil: number | null }
        if (partyStore.me && p.playerId === partyStore.me.id) {
          if (p.muted) {
            const until = p.mutedUntil
              ? ` fino alle ${new Date(p.mutedUntil).toLocaleTimeString()}`
              : ' a tempo indeterminato'
            feedbackStore.pushToast({
              level: 'danger',
              title: 'Sei stato silenziato' + until,
              ttlMs: 7000
            })
          } else {
            feedbackStore.pushToast({
              level: 'info',
              title: 'Puoi di nuovo scrivere in chat',
              ttlMs: 4000
            })
          }
        }
        break
      }
      case 'kicked': {
        const p = data as { reason: string | null }
        errorFeedback.reportKicked(p.reason)
        break
      }
      case 'weather:updated': {
        const p = data as { areaId: string | null, effective: { code: string, intensity: number, label: string } | null }
        weatherOverridesStore.set(p.areaId, p.effective ? { code: p.effective.code, intensity: p.effective.intensity } : null)
        break
      }
      case 'voice:signal': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gdr:voice-signal', { detail: data }))
        }
        break
      }
      case 'master:actions-snapshot': {
        const p = data as { actions: Array<unknown> }
        import('~/stores/master-tools').then(({ useMasterToolsStore }) => {
          useMasterToolsStore(seed).setActions(p.actions as never)
        }).catch(() => { /* ignore */ })
        break
      }
      case 'master:bans-snapshot': {
        const p = data as { bans: Array<unknown> }
        import('~/stores/master-tools').then(({ useMasterToolsStore }) => {
          useMasterToolsStore(seed).setBans(p.bans as never)
        }).catch(() => { /* ignore */ })
        break
      }
      case 'error': {
        const p = data as { code?: string, detail?: string }
        errorFeedback.reportError(p.code ?? 'unknown', p.detail ?? null)
        break
      }
    }
  }

  // Apri subito alla creazione
  openSocket()

  return {
    seed, ws, status, pendingQueue, reconnectAt, reconnectAttempts, notMember,
    send, retryNow, close
  }
}

export interface PartyConnections {
  open(seed: string): PartyConnection
  close(seed: string): void
  closeAll(): void
  list(): PartyConnection[]
  get(seed: string): PartyConnection | null
}

export function usePartyConnections(): PartyConnections {
  return {
    open(seed) {
      const existing = connections.get(seed)
      if (existing) return existing
      const c = makeConnection(seed)
      connections.set(seed, c)
      return c
    },
    close(seed) {
      const c = connections.get(seed)
      if (!c) return
      c.close()
      connections.delete(seed)
    },
    closeAll() {
      for (const seed of [...connections.keys()]) {
        const c = connections.get(seed)
        if (c) c.close()
      }
      connections.clear()
    },
    list() {
      return [...connections.values()]
    },
    get(seed) {
      return connections.get(seed) ?? null
    }
  }
}

// Helper per i test: azzera tutte le connection senza dover toccare ws reali.
export function _resetPartyConnectionsForTests() {
  for (const c of connections.values()) {
    try {
      c.close()
    } catch { /* skip */ }
  }
  connections.clear()
}
