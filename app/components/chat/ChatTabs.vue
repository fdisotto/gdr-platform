<script setup lang="ts">
import { computed } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'

export type ChatTab
  = | { kind: 'area' }
    | { kind: 'whispers' }
    | { kind: 'ooc' }
    | { kind: 'dm', threadKey: string, otherNickname: string }

const props = defineProps<{ activeTab: ChatTab }>()
const emit = defineEmits<{ (e: 'select', tab: ChatTab): void }>()

const chatStore = useChatStore()
const partyStore = usePartyStore()

const dmThreads = computed(() => {
  if (!partyStore.me) return []
  return chatStore.listDmThreads(partyStore.me.id, partyStore.players)
})

function isActive(t: ChatTab): boolean {
  if (t.kind !== props.activeTab.kind) return false
  if (t.kind === 'dm' && props.activeTab.kind === 'dm') {
    return t.threadKey === props.activeTab.threadKey
  }
  return true
}

function tabLabel(t: ChatTab): string {
  switch (t.kind) {
    case 'area': return `Area${partyStore.me?.currentAreaId ? ' · ' + partyStore.me.currentAreaId : ''}`
    case 'whispers': return 'Sussurri'
    case 'ooc': return 'OOC'
    case 'dm': return `DM · ${t.otherNickname}`
  }
}

function click(t: ChatTab) {
  emit('select', t)
}
</script>

<template>
  <div
    class="flex items-center gap-1 px-4 py-2 overflow-x-auto"
    style="border-bottom: 1px solid var(--z-border)"
  >
    <button
      v-for="t in [{ kind: 'area' as const }, { kind: 'whispers' as const }, { kind: 'ooc' as const }]"
      :key="t.kind"
      type="button"
      class="text-xs px-3 py-1 rounded whitespace-nowrap"
      :style="isActive(t)
        ? 'background: var(--z-green-700); color: var(--z-green-100)'
        : 'background: var(--z-bg-700); color: var(--z-text-md)'"
      @click="click(t)"
    >
      {{ tabLabel(t) }}
    </button>
    <button
      v-for="th in dmThreads"
      :key="th.key"
      type="button"
      class="text-xs px-3 py-1 rounded whitespace-nowrap"
      :style="isActive({ kind: 'dm', threadKey: th.key, otherNickname: th.otherNickname })
        ? 'background: var(--z-whisper-500); color: var(--z-bg-900)'
        : 'background: var(--z-bg-700); color: var(--z-whisper-300)'"
      @click="click({ kind: 'dm', threadKey: th.key, otherNickname: th.otherNickname })"
    >
      DM · {{ th.otherNickname }}
    </button>
  </div>
</template>
