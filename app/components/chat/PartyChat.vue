<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import ChatMessage from '~/components/chat/ChatMessage.vue'
import ChatInput from '~/components/chat/ChatInput.vue'

const chatStore = useChatStore()
const partyStore = usePartyStore()

const scrollTarget = ref<HTMLElement | null>(null)

const currentAreaId = computed(() => partyStore.me?.currentAreaId ?? '')
const messages = computed(() => chatStore.forArea(currentAreaId.value))
const isMaster = computed(() => partyStore.me?.role === 'master')

watch(messages, async () => {
  await nextTick()
  scrollTarget.value?.scrollTo({ top: scrollTarget.value.scrollHeight, behavior: 'smooth' })
}, { deep: true })
</script>

<template>
  <section
    class="flex flex-col"
    style="background: var(--z-bg-800); border-top: 1px solid var(--z-border); height: 45vh"
  >
    <div
      class="px-4 py-2 text-xs uppercase tracking-wide"
      style="color: var(--z-text-md)"
    >
      Chat · {{ currentAreaId || '…' }}
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
