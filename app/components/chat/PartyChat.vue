<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore, type ChatMessage as ChatMessageType } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { useSettingsStore } from '~/stores/settings'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatInput from '~/components/chat/ChatInput.vue'

const chatStore = useChatStore()
const partyStore = usePartyStore()
const settings = useSettingsStore()

const scrollTarget = ref<HTMLElement | null>(null)

const currentAreaId = computed(() => partyStore.me?.currentAreaId ?? '')
const isMaster = computed(() => partyStore.me?.role === 'master')
const showAll = ref(false)

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

watch(messages, async () => {
  await nextTick()
  scrollTarget.value?.scrollTo({ top: scrollTarget.value.scrollHeight, behavior: 'smooth' })
}, { deep: true })
</script>

<template>
  <section
    class="flex flex-col"
    style="background: var(--z-bg-800); border-top: 1px solid var(--z-border); height: 40vh; min-height: 260px; max-height: 50vh; flex-shrink: 0"
  >
    <div
      class="px-4 py-2 text-xs uppercase tracking-wide flex items-center justify-between"
      style="color: var(--z-text-md); border-bottom: 1px solid var(--z-border)"
    >
      <span>
        Chat · <span style="color: var(--z-green-300)">{{ showAll && isMaster ? 'tutto' : (currentAreaId || '…') }}</span>
      </span>
      <div class="flex items-center gap-2">
        <button
          v-if="isMaster"
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
          type="button"
          class="text-xs px-2 py-0.5 rounded"
          :title="settings.colorNicknames ? 'Disattiva colori nickname' : 'Attiva colori nickname'"
          :style="settings.colorNicknames
            ? 'background: var(--z-green-700); color: var(--z-green-100)'
            : 'background: var(--z-bg-700); color: var(--z-text-md)'"
          @click="settings.toggleColorNicknames()"
        >
          🎨 nick {{ settings.colorNicknames ? 'on' : 'off' }}
        </button>
      </div>
    </div>
    <div
      ref="scrollTarget"
      class="flex-1 overflow-y-auto px-4 py-2 space-y-1"
    >
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
  </section>
</template>
