<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, type ChatMessage as ChatMessageType } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { useSettingsStore } from '~/stores/settings'
import { useViewStore } from '~/stores/view'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatInput from '~/components/chat/ChatInput.vue'

const seed = usePartySeed()
const chatStore = useChatStore(seed)
const partyStore = usePartyStore(seed)
const settings = useSettingsStore()
const viewStore = useViewStore(seed)
const connection = usePartyConnections().open(seed)

const scrollTarget = ref<HTMLElement | null>(null)

const currentAreaId = computed(() => partyStore.me?.currentAreaId ?? '')
const isMaster = computed(() => partyStore.me?.role === 'master')
const showAll = ref(false)
const loadingMore = ref(false)
const HISTORY_PAGE_SIZE = 50

const hasMoreHistory = computed(() => {
  if (!currentAreaId.value) return false
  if (showAll.value) return false
  return chatStore.areaHasMoreFor(currentAreaId.value)
})

function loadMoreHistory() {
  if (loadingMore.value || !currentAreaId.value || showAll.value) return
  const list = chatStore.forArea(currentAreaId.value)
  const oldest = list[0]
  const before = oldest?.createdAt ?? Date.now()
  loadingMore.value = true
  connection.send({
    type: 'chat:history-before',
    areaId: currentAreaId.value,
    before,
    limit: HISTORY_PAGE_SIZE
  })
  // Il flag viene spento alla prossima mutazione dei messaggi (risposta server)
}

// Stream unico: tutti i messaggi dell'area eccetto dm (che vanno nell'inbox missive)
const messages = computed(() => {
  if (showAll.value && isMaster.value) {
    const all: ChatMessageType[] = []
    for (const arr of Object.values(chatStore.messagesByArea)) {
      for (const m of arr) {
        if (m.kind !== 'dm') all.push(m)
      }
    }
    all.sort((a, b) => a.createdAt - b.createdAt)
    return all
  }
  return chatStore.forArea(currentAreaId.value).filter(m => m.kind !== 'dm')
})

// Scroll smart: se arriva un nuovo messaggio in fondo scrolla giù, se
// l'aggiornamento è un prepend (history load) mantieni la posizione
// aggiungendo la differenza di altezza.
let lastBottomId: string | null = null
let lastScrollHeight = 0
watch(messages, async (newList) => {
  const newBottomId = newList.length > 0 ? newList[newList.length - 1]!.id : null
  const isPrepend = newBottomId !== null && newBottomId === lastBottomId
  const el = scrollTarget.value
  await nextTick()
  if (!el) {
    lastBottomId = newBottomId
    return
  }
  if (isPrepend) {
    const delta = el.scrollHeight - lastScrollHeight
    if (delta > 0) el.scrollTop += delta
  } else {
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }
  lastBottomId = newBottomId
  lastScrollHeight = el.scrollHeight
  loadingMore.value = false
}, { deep: true })
</script>

<template>
  <section
    class="flex flex-col"
    :class="viewStore.chatCollapsed ? '' : 'chat-expanded'"
    style="background: var(--z-bg-800); border-top: 1px solid var(--z-border); flex-shrink: 0"
  >
    <div
      class="px-4 py-2 text-xs uppercase tracking-wide flex items-center justify-between"
      style="color: var(--z-text-md)"
      :style="viewStore.chatCollapsed ? '' : 'border-bottom: 1px solid var(--z-border)'"
    >
      <span>
        Chat · <span style="color: var(--z-green-300)">{{ showAll && isMaster ? 'tutto' : (currentAreaId || '…') }}</span>
        <span
          v-if="viewStore.chatCollapsed && viewStore.unreadWhileCollapsed > 0"
          class="ml-2 font-mono-z px-1.5 py-0.5 rounded"
          style="background: var(--z-blood-700); color: var(--z-blood-300)"
        >{{ viewStore.unreadWhileCollapsed }} nuovi</span>
      </span>
      <div class="flex items-center gap-2">
        <button
          v-if="isMaster && !viewStore.chatCollapsed"
          type="button"
          class="text-xs px-2 py-0.5 rounded"
          :title="showAll ? 'Mostra solo area corrente' : 'Mostra tutte le aree'"
          :style="showAll
            ? 'background: var(--z-rust-700); color: var(--z-rust-300)'
            : 'background: var(--z-bg-700); color: var(--z-text-md)'"
          @click="showAll = !showAll"
        >
          {{ showAll ? 'Tutto' : 'Solo area' }}
        </button>
        <button
          v-if="!viewStore.chatCollapsed"
          type="button"
          class="text-xs px-2 py-0.5 rounded flex items-center gap-1"
          :title="settings.colorNicknames ? 'Disattiva colori nickname' : 'Attiva colori nickname'"
          :style="settings.colorNicknames
            ? 'background: var(--z-green-700); color: var(--z-green-100)'
            : 'background: var(--z-bg-700); color: var(--z-text-md)'"
          @click="settings.toggleColorNicknames()"
        >
          <UIcon
            name="i-lucide-palette"
            class="size-3.5"
          />
          <span>nick {{ settings.colorNicknames ? 'on' : 'off' }}</span>
        </button>
        <button
          type="button"
          class="text-xs px-2 py-0.5 rounded"
          :title="viewStore.chatCollapsed ? 'Espandi chat' : 'Collassa chat per ingrandire la mappa'"
          style="background: var(--z-bg-700); color: var(--z-text-md)"
          @click="viewStore.toggleChatCollapsed()"
        >
          {{ viewStore.chatCollapsed ? '▴' : '▾' }}
        </button>
      </div>
    </div>
    <template v-if="!viewStore.chatCollapsed">
      <div
        ref="scrollTarget"
        class="flex-1 overflow-y-auto px-4 py-2 space-y-1"
      >
        <div
          v-if="hasMoreHistory"
          class="flex justify-center py-1"
        >
          <button
            type="button"
            class="text-xs px-2 py-1 rounded"
            :disabled="loadingMore"
            :style="loadingMore
              ? 'background: var(--z-bg-700); color: var(--z-text-lo); cursor: wait'
              : 'background: var(--z-bg-700); color: var(--z-text-md); cursor: pointer'"
            @click="loadMoreHistory"
          >
            {{ loadingMore ? 'Caricamento…' : '↑ Carica più vecchi' }}
          </button>
        </div>
        <ChatMessage
          v-for="m in messages"
          :key="m.id"
          :message="m"
          :is-master="isMaster"
        />
        <div
          v-if="!messages.length"
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Nessun messaggio in questa area.
        </div>
      </div>
      <ChatInput />
    </template>
  </section>
</template>

<style scoped>
/* Mobile: chat expanded prende il 55% del viewport, con min più basso */
.chat-expanded {
  height: 55vh;
  min-height: 200px;
  max-height: 65vh;
}
/* Desktop: come prima, con tetto al 50vh */
@media (min-width: 768px) {
  .chat-expanded {
    height: 40vh;
    min-height: 260px;
    max-height: 50vh;
  }
}
</style>
