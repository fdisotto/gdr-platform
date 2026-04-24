import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface ChatMessage {
  id: string
  partySeed: string
  kind: string
  authorPlayerId: string | null
  authorDisplay: string
  areaId: string | null
  targetPlayerId: string | null
  body: string
  rollPayload: string | null
  createdAt: number
  deletedAt: number | null
  deletedBy: string | null
  editedAt: number | null
  // Client-only flag: true per messaggi inviati durante reconnect, in
  // attesa di echo dal server. Non esiste sul server.
  pending?: boolean
}

// Finestra in cui un messaggio pending viene riconciliato con l'echo
// server matching su authorPlayerId/kind/body. Dopo questo tempo viene
// marcato come "fallito" (resterà visibile ma grigio).
const PENDING_MATCH_WINDOW_MS = 60_000

// Tipi di messaggio che contano per il badge "ha appena parlato":
// escludiamo whisper e dm (privati), system (non un player), npc/announce
// (parole del master travestite) e roll (è un evento, non discorso).
const PUBLIC_SPEECH_KINDS = new Set(['say', 'emote', 'shout', 'ooc'])

export const useChatStore = defineStore('chat', () => {
  const messagesByArea = ref<Record<string, ChatMessage[]>>({})
  const dmsByThread = ref<Record<string, ChatMessage[]>>({})
  const inputDraft = ref('')

  // Flag hasMore per canale, usato dalla UI per decidere "carica più"
  const areaHasMore = ref<Record<string, boolean>>({})
  const threadHasMore = ref<Record<string, boolean>>({})

  // Ultimo player che ha parlato in chat pubblica (per badge sull'avatar)
  const lastSpeakerPlayerId = ref<string | null>(null)
  const lastSpokeAt = ref<number>(0)
  function noteSpeaker(msg: ChatMessage) {
    if (!msg.authorPlayerId) return
    if (!PUBLIC_SPEECH_KINDS.has(msg.kind)) return
    lastSpeakerPlayerId.value = msg.authorPlayerId
    lastSpokeAt.value = msg.createdAt
  }

  function hydrate(payload: Record<string, ChatMessage[]>) {
    messagesByArea.value = { ...payload }
    // Riprendi l'ultimo speaker pubblico dalla history iniziale così il
    // badge ha uno stato sensato subito al join (non vuoto finché non
    // qualcuno riparla).
    let bestTs = 0
    let bestId: string | null = null
    for (const arr of Object.values(payload)) {
      for (const m of arr) {
        if (!m.authorPlayerId) continue
        if (!PUBLIC_SPEECH_KINDS.has(m.kind)) continue
        if (m.createdAt > bestTs) {
          bestTs = m.createdAt
          bestId = m.authorPlayerId
        }
      }
    }
    lastSpeakerPlayerId.value = bestId
    lastSpokeAt.value = bestTs
  }

  function append(msg: ChatMessage) {
    const area = msg.areaId
    if (!area) return
    const list = messagesByArea.value[area] ?? []
    // Se questo echo corrisponde a un pending dell'autore → rimuovilo,
    // così l'utente vede un solo messaggio "definitivo" al posto della
    // versione clock-icon.
    const matched = matchPendingIndex(list, msg)
    if (matched >= 0) {
      const next = [...list]
      next.splice(matched, 1)
      next.push(msg)
      messagesByArea.value[area] = next
    } else {
      messagesByArea.value[area] = [...list, msg]
    }
    noteSpeaker(msg)
  }

  function matchPendingIndex(list: ChatMessage[], echo: ChatMessage): number {
    if (!echo.authorPlayerId) return -1
    for (let i = 0; i < list.length; i++) {
      const m = list[i]!
      if (!m.pending) continue
      if (m.authorPlayerId !== echo.authorPlayerId) continue
      if (m.kind !== echo.kind) continue
      if (m.body !== echo.body) continue
      if (Math.abs(m.createdAt - echo.createdAt) > PENDING_MATCH_WINDOW_MS) continue
      return i
    }
    return -1
  }

  // Optimistic append: chiamato quando il ws è in reconnecting.
  // Il messaggio compare subito come pending; verrà sostituito dall'echo.
  function appendPending(msg: ChatMessage) {
    const area = msg.areaId
    if (!area) return
    const list = messagesByArea.value[area] ?? []
    messagesByArea.value[area] = [...list, msg]
  }

  function appendPendingDm(msg: ChatMessage, selfId: string) {
    if (msg.kind !== 'dm') return
    const otherId = msg.authorPlayerId === selfId ? msg.targetPlayerId : msg.authorPlayerId
    if (!otherId) return
    const key = threadKey(selfId, otherId)
    const existing = dmsByThread.value[key] ?? []
    dmsByThread.value[key] = [...existing, msg]
  }

  function update(msg: ChatMessage) {
    const area = msg.areaId
    if (!area) return
    const list = messagesByArea.value[area]
    if (!list) return
    const idx = list.findIndex(m => m.id === msg.id)
    if (idx === -1) {
      messagesByArea.value[area] = [...list, msg]
    } else {
      const copy = [...list]
      copy[idx] = msg
      messagesByArea.value[area] = copy
    }
  }

  function forArea(areaId: string): ChatMessage[] {
    return messagesByArea.value[areaId] ?? []
  }

  function threadKey(aId: string, bId: string): string {
    return [aId, bId].sort().join('::')
  }

  function appendDm(msg: ChatMessage, selfId: string) {
    if (msg.kind !== 'dm') return
    const otherId = msg.authorPlayerId === selfId
      ? msg.targetPlayerId
      : msg.authorPlayerId
    if (!otherId) return
    const key = threadKey(selfId, otherId)
    const existing = dmsByThread.value[key] ?? []
    const matched = matchPendingIndex(existing, msg)
    if (matched >= 0) {
      const next = [...existing]
      next.splice(matched, 1)
      next.push(msg)
      dmsByThread.value[key] = next
    } else {
      dmsByThread.value[key] = [...existing, msg]
    }
  }

  function forThread(key: string): ChatMessage[] {
    return dmsByThread.value[key] ?? []
  }

  function listDmThreads(selfId: string, knownPlayers: Array<{ id: string, nickname: string }>): Array<{ key: string, otherId: string, otherNickname: string, lastMessage: ChatMessage | null }> {
    const byId = new Map(knownPlayers.map(p => [p.id, p.nickname]))
    const result: Array<{ key: string, otherId: string, otherNickname: string, lastMessage: ChatMessage | null }> = []
    for (const [key, msgs] of Object.entries(dmsByThread.value)) {
      const [a, b] = key.split('::') as [string, string]
      const otherId = a === selfId ? b : a
      const otherNickname = byId.get(otherId) ?? otherId.slice(0, 6)
      const lastMessage = msgs[msgs.length - 1] ?? null
      result.push({ key, otherId, otherNickname, lastMessage })
    }
    return result.sort((x, y) =>
      (y.lastMessage?.createdAt ?? 0) - (x.lastMessage?.createdAt ?? 0)
    )
  }

  function prependArea(areaId: string, batch: ChatMessage[], hasMore: boolean) {
    const existing = messagesByArea.value[areaId] ?? []
    // Dedup sugli id, nel caso un messaggio sia arrivato real-time prima della batch.
    const existingIds = new Set(existing.map(m => m.id))
    const deduped = batch.filter(m => !existingIds.has(m.id))
    messagesByArea.value[areaId] = [...deduped, ...existing]
    areaHasMore.value[areaId] = hasMore
  }

  function prependThread(threadKey: string, batch: ChatMessage[], hasMore: boolean) {
    const existing = dmsByThread.value[threadKey] ?? []
    const existingIds = new Set(existing.map(m => m.id))
    const deduped = batch.filter(m => !existingIds.has(m.id))
    dmsByThread.value[threadKey] = [...deduped, ...existing]
    threadHasMore.value[threadKey] = hasMore
  }

  function areaHasMoreFor(areaId: string): boolean {
    return areaHasMore.value[areaId] ?? true
  }

  function threadHasMoreFor(key: string): boolean {
    return threadHasMore.value[key] ?? true
  }

  function hydrateDms(dms: ChatMessage[], selfId: string) {
    const grouped: Record<string, ChatMessage[]> = {}
    for (const m of dms) {
      if (m.kind !== 'dm') continue
      const otherId = m.authorPlayerId === selfId ? m.targetPlayerId : m.authorPlayerId
      if (!otherId) continue
      const key = threadKey(selfId, otherId)
      grouped[key] = grouped[key] ?? []
      grouped[key].push(m)
    }
    // Sort ogni thread
    for (const key of Object.keys(grouped)) {
      grouped[key]!.sort((a, b) => a.createdAt - b.createdAt)
    }
    dmsByThread.value = grouped
  }

  function reset() {
    messagesByArea.value = {}
    dmsByThread.value = {}
    areaHasMore.value = {}
    threadHasMore.value = {}
    inputDraft.value = ''
    lastSpeakerPlayerId.value = null
    lastSpokeAt.value = 0
  }

  return {
    messagesByArea, dmsByThread, inputDraft,
    areaHasMore, threadHasMore,
    lastSpeakerPlayerId, lastSpokeAt,
    hydrate, hydrateDms, append, update, forArea, forThread,
    appendDm, appendPending, appendPendingDm,
    listDmThreads, threadKey,
    prependArea, prependThread,
    areaHasMoreFor, threadHasMoreFor,
    reset
  }
})
