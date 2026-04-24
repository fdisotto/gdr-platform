<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { useViewStore } from '~/stores/view'
import ChatMessage from '~/components/chat/ChatMessage.vue'

const chatStore = useChatStore()
const partyStore = usePartyStore()
const viewStore = useViewStore()

const threads = computed(() => {
  if (!partyStore.me) return []
  return chatStore.listDmThreads(partyStore.me.id, partyStore.players)
})

const selectedKey = computed(() => viewStore.selectedThreadKey)

const selectedMessages = computed(() => {
  if (!selectedKey.value) return []
  return chatStore.forThread(selectedKey.value)
})

const otherPlayers = computed(() =>
  partyStore.players.filter(p => p.id !== partyStore.me?.id)
)

function openThread(threadKey: string) {
  viewStore.openThread(threadKey)
}

function startNewWith(otherId: string) {
  if (!partyStore.me) return
  const key = chatStore.threadKey(partyStore.me.id, otherId)
  viewStore.openThread(key)
}

const isMaster = computed(() => partyStore.me?.role === 'master')
</script>

<template>
  <section
    class="w-full flex"
    style="height: 55vh; background: var(--z-bg-900); border-bottom: 1px solid var(--z-border)"
  >
    <aside
      class="w-64 flex flex-col"
      style="border-right: 1px solid var(--z-border); background: var(--z-bg-800)"
    >
      <h3
        class="text-xs uppercase tracking-wide px-4 py-2"
        style="color: var(--z-text-md)"
      >
        Conversazioni
      </h3>
      <ul class="flex-1 overflow-y-auto">
        <li
          v-for="t in threads"
          :key="t.key"
          class="px-4 py-2 cursor-pointer"
          :style="selectedKey === t.key
            ? 'background: var(--z-whisper-500); color: var(--z-bg-900)'
            : 'background: transparent; color: var(--z-text-hi)'"
          @click="openThread(t.key)"
        >
          <div class="text-sm font-medium">
            {{ t.otherNickname }}
          </div>
          <div
            v-if="t.lastMessage"
            class="text-xs truncate"
            style="opacity: 0.7"
          >
            {{ t.lastMessage.body }}
          </div>
        </li>
        <li
          v-if="!threads.length"
          class="text-xs italic px-4 py-3"
          style="color: var(--z-text-lo)"
        >
          Nessuna conversazione attiva.
        </li>
      </ul>
      <div style="border-top: 1px solid var(--z-border)">
        <h4
          class="text-xs uppercase tracking-wide px-4 pt-3 pb-1"
          style="color: var(--z-text-md)"
        >
          Avvia nuova
        </h4>
        <ul class="pb-2">
          <li
            v-for="p in otherPlayers"
            :key="p.id"
            class="px-4 py-1 text-xs cursor-pointer hover:opacity-80"
            style="color: var(--z-green-300)"
            @click="startNewWith(p.id)"
          >
            + {{ p.nickname }}
          </li>
        </ul>
      </div>
    </aside>
    <div class="flex-1 overflow-y-auto p-4 space-y-1">
      <ChatMessage
        v-for="m in selectedMessages"
        :key="m.id"
        :message="m"
        :is-master="isMaster"
      />
      <p
        v-if="!selectedKey"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Seleziona una conversazione dalla lista o avvia una nuova.
      </p>
      <p
        v-else-if="!selectedMessages.length"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessun messaggio in questa conversazione. Usa l'input chat con `/dm nickname testo`.
      </p>
    </div>
  </section>
</template>
