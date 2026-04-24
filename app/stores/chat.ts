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
}

export const useChatStore = defineStore('chat', () => {
  const messagesByArea = ref<Record<string, ChatMessage[]>>({})
  const dmsByThread = ref<Record<string, ChatMessage[]>>({})
  const inputDraft = ref('')

  function hydrate(payload: Record<string, ChatMessage[]>) {
    messagesByArea.value = { ...payload }
  }

  function append(msg: ChatMessage) {
    const area = msg.areaId
    if (!area) return
    const list = messagesByArea.value[area] ?? []
    messagesByArea.value[area] = [...list, msg]
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
    dmsByThread.value[key] = [...existing, msg]
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

  function reset() {
    messagesByArea.value = {}
    dmsByThread.value = {}
    inputDraft.value = ''
  }

  return {
    messagesByArea, dmsByThread, inputDraft,
    hydrate, append, update, forArea, forThread,
    appendDm, listDmThreads, threadKey,
    reset
  }
})
