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

  function reset() {
    messagesByArea.value = {}
    inputDraft.value = ''
  }

  return { messagesByArea, inputDraft, hydrate, append, update, forArea, reset }
})
