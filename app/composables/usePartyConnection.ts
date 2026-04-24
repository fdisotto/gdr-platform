import { ref, type Ref } from 'vue'
import { usePartyStore, type MeSnapshot, type PartySnapshot, type PlayerSnapshot, type AreaStateSnapshot } from '~/stores/party'
import { useChatStore, type ChatMessage } from '~/stores/chat'
import { useServerTime } from '~/composables/useServerTime'
import { useZombiesStore } from '~/stores/zombies'
import { usePlayerPositionsStore } from '~/stores/player-positions'
import type { Zombie, PlayerPosition } from '~~/shared/protocol/ws'

interface ConnectOptions {
  seed: string
  sessionToken: string
}

type Status = 'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'

// Singleton a livello di modulo: tutti i componenti che chiamano
// usePartyConnection() condividono la stessa WebSocket. Senza questo ogni
// chiamata creava un ref locale nuovo — il send dal ChatInput andava a una
// connessione diversa da quella aperta dalla party page.
let wsRef: Ref<WebSocket | null> | null = null
let statusRef: Ref<Status> | null = null
let pendingQueueRef: Ref<Record<string, unknown>[]> | null = null
let closedFlag = false
let reconnectAttempts = 0
let pendingOpts: ConnectOptions | null = null

function wsUrl(): string {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws/party`
}

export function usePartyConnection() {
  if (!wsRef) wsRef = ref<WebSocket | null>(null)
  if (!statusRef) statusRef = ref<Status>('idle')
  if (!pendingQueueRef) pendingQueueRef = ref<Record<string, unknown>[]>([])

  const ws = wsRef
  const status = statusRef
  const pendingQueue = pendingQueueRef

  const partyStore = usePartyStore()
  const chatStore = useChatStore()
  const serverTime = useServerTime()
  const zombiesStore = useZombiesStore()
  const playerPositionsStore = usePlayerPositionsStore()

  function scheduleReconnect() {
    if (closedFlag) return
    reconnectAttempts++
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempts, 5))
    status.value = 'reconnecting'
    setTimeout(() => {
      if (!closedFlag && pendingOpts) connect(pendingOpts)
    }, delay)
  }

  function connect(opts: ConnectOptions) {
    // Idempotente: se già connesso allo stesso seed+token, non riconnettere.
    if (
      ws.value
      && (status.value === 'connecting' || status.value === 'open')
      && pendingOpts
      && pendingOpts.seed === opts.seed
      && pendingOpts.sessionToken === opts.sessionToken
    ) {
      return
    }
    pendingOpts = opts
    closedFlag = false
    status.value = 'connecting'
    const sock = new WebSocket(wsUrl())
    ws.value = sock

    sock.addEventListener('open', () => {
      reconnectAttempts = 0
      status.value = 'open'
      sock.send(JSON.stringify({ type: 'hello', seed: opts.seed, sessionToken: opts.sessionToken }))
      // Flush pending messages accumulati durante reconnecting.
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

    sock.addEventListener('close', () => {
      ws.value = null
      if (!closedFlag) scheduleReconnect()
      else status.value = 'closed'
    })

    sock.addEventListener('error', () => {
      try {
        sock.close()
      } catch { /* no-op */ }
    })
  }

  function disconnect() {
    closedFlag = true
    status.value = 'closed'
    ws.value?.close()
    ws.value = null
    pendingOpts = null
    reconnectAttempts = 0
    pendingQueue.value = []
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

  function handleEvent(data: Record<string, unknown>) {
    switch (data.type) {
      case 'state:init': {
        const init = data as unknown as {
          me: MeSnapshot
          party: PartySnapshot
          players: PlayerSnapshot[]
          areasState: AreaStateSnapshot[]
          messagesByArea: Record<string, ChatMessage[]>
          dms: ChatMessage[]
          zombies: Zombie[]
          playerPositions: PlayerPosition[]
          serverTime: number
        }
        partyStore.hydrate({
          me: init.me, party: init.party,
          players: init.players, areasState: init.areasState
        })
        chatStore.hydrate(init.messagesByArea ?? {})
        chatStore.hydrateDms(init.dms ?? [], init.me.id)
        zombiesStore.hydrate(init.zombies ?? [])
        playerPositionsStore.hydrate(init.playerPositions ?? [])
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
        break
      }
      case 'message:update': {
        const m = (data as { message: ChatMessage }).message
        chatStore.update(m)
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
        const payload = data as { playerId: string, toAreaId: string, fromAreaId: string, teleported: boolean }
        partyStore.players = partyStore.players.map(p =>
          p.id === payload.playerId ? { ...p, currentAreaId: payload.toAreaId } : p
        )
        if (partyStore.me && partyStore.me.id === payload.playerId) {
          partyStore.me = { ...partyStore.me, currentAreaId: payload.toAreaId }
        }
        // La posizione dettaglio è legata a un'area specifica; reset per il player
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
        // TODO Plan 6: toast notification
        console.info('[ws] player muted', p)
        break
      }
      case 'kicked': {
        const p = data as { reason: string | null }
        console.warn('[ws] you were kicked:', p.reason)
        if (typeof window !== 'undefined') {
          window.alert(`Sei stato espulso dalla party${p.reason ? ': ' + p.reason : ''}.`)
          window.location.href = '/'
        }
        break
      }
      case 'voice:signal': {
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('gdr:voice-signal', { detail: data }))
        }
        break
      }
      case 'error': {
        console.warn('[ws error]', data)
        break
      }
    }
  }

  return { ws, status, pendingQueue, connect, disconnect, send }
}

// Helper per i test: azzera il singleton.
export function _resetPartyConnectionForTests() {
  wsRef = null
  statusRef = null
  pendingQueueRef = null
  closedFlag = false
  reconnectAttempts = 0
  pendingOpts = null
}
