import { ref, onBeforeUnmount } from 'vue'
import { usePartyStore, type MeSnapshot, type PartySnapshot, type PlayerSnapshot, type AreaStateSnapshot } from '~/stores/party'
import { useChatStore, type ChatMessage } from '~/stores/chat'
import { useServerTime } from '~/composables/useServerTime'

interface ConnectOptions {
  seed: string
  sessionToken: string
}

export function usePartyConnection() {
  const partyStore = usePartyStore()
  const chatStore = useChatStore()
  const serverTime = useServerTime()

  const ws = ref<WebSocket | null>(null)
  const status = ref<'idle' | 'connecting' | 'open' | 'reconnecting' | 'closed'>('idle')
  let closed = false
  let reconnectAttempts = 0
  let pendingOpts: ConnectOptions | null = null

  function wsUrl(): string {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${window.location.host}/ws/party`
  }

  function scheduleReconnect() {
    if (closed) return
    reconnectAttempts++
    const delay = Math.min(30_000, 1000 * 2 ** Math.min(reconnectAttempts, 5))
    status.value = 'reconnecting'
    setTimeout(() => {
      if (!closed && pendingOpts) connect(pendingOpts)
    }, delay)
  }

  function connect(opts: ConnectOptions) {
    pendingOpts = opts
    closed = false
    status.value = 'connecting'
    const sock = new WebSocket(wsUrl())
    ws.value = sock

    sock.addEventListener('open', () => {
      reconnectAttempts = 0
      status.value = 'open'
      sock.send(JSON.stringify({ type: 'hello', seed: opts.seed, sessionToken: opts.sessionToken }))
    })

    sock.addEventListener('message', (ev) => {
      try {
        const data = JSON.parse(ev.data as string) as Record<string, unknown>
        handleEvent(data)
      } catch { /* ignore malformed */ }
    })

    sock.addEventListener('close', () => {
      ws.value = null
      if (!closed) scheduleReconnect()
      else status.value = 'closed'
    })

    sock.addEventListener('error', () => {
      try {
        sock.close()
      } catch { /* no-op */ }
    })
  }

  function disconnect() {
    closed = true
    status.value = 'closed'
    ws.value?.close()
    ws.value = null
  }

  function send(event: Record<string, unknown>) {
    if (ws.value && ws.value.readyState === WebSocket.OPEN) {
      ws.value.send(JSON.stringify(event))
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
          serverTime: number
        }
        partyStore.hydrate({
          me: init.me, party: init.party,
          players: init.players, areasState: init.areasState
        })
        chatStore.hydrate(init.messagesByArea ?? {})
        serverTime.sync(init.serverTime)
        break
      }
      case 'message:new': {
        const m = (data as { message: ChatMessage }).message
        chatStore.append(m)
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
        break
      }
      case 'area:entered': {
        const payload = data as { areaId: string, messages: ChatMessage[] }
        chatStore.messagesByArea[payload.areaId] = payload.messages
        break
      }
      case 'error': {
        console.warn('[ws error]', data)
        break
      }
    }
  }

  onBeforeUnmount(() => {
    disconnect()
  })

  return { ws, status, connect, disconnect, send }
}
