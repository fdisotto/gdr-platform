<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatInput from '~/components/chat/ChatInput.vue'
import ChatTabs, { type ChatTab } from '~/components/chat/ChatTabs.vue'

const chatStore = useChatStore()
const partyStore = usePartyStore()

const scrollTarget = ref<HTMLElement | null>(null)
const activeTab = ref<ChatTab>({ kind: 'area' })

const currentAreaId = computed(() => partyStore.me?.currentAreaId ?? '')
const isMaster = computed(() => partyStore.me?.role === 'master')

const visibleMessages = computed(() => {
  const tab = activeTab.value
  const areaMsgs = chatStore.forArea(currentAreaId.value)
  if (tab.kind === 'area') {
    return areaMsgs.filter(m => !['whisper', 'ooc', 'dm'].includes(m.kind))
  }
  if (tab.kind === 'whispers') {
    return areaMsgs.filter(m => m.kind === 'whisper')
  }
  if (tab.kind === 'ooc') {
    return areaMsgs.filter(m => m.kind === 'ooc')
  }
  if (tab.kind === 'dm') {
    return chatStore.forThread(tab.threadKey)
  }
  return []
})

watch(visibleMessages, async () => {
  await nextTick()
  scrollTarget.value?.scrollTo({ top: scrollTarget.value.scrollHeight, behavior: 'smooth' })
}, { deep: true })

function onSelectTab(t: ChatTab) {
  activeTab.value = t
}
</script>

<template>
  <section
    class="flex flex-col"
    style="background: var(--z-bg-800); border-top: 1px solid var(--z-border); height: 45vh"
  >
    <ChatTabs
      :active-tab="activeTab"
      @select="onSelectTab"
    />
    <div
      ref="scrollTarget"
      class="flex-1 overflow-y-auto px-4 py-2 space-y-1"
    >
      <ChatMessage
        v-for="m in visibleMessages"
        :key="m.id"
        :message="m"
        :is-master="isMaster"
      />
      <div
        v-if="!visibleMessages.length"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessun messaggio in questo canale.
      </div>
    </div>
    <ChatInput />
  </section>
</template>
