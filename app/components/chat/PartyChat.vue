<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { usePartyConnection } from '~/composables/usePartyConnection'

const chatStore = useChatStore()
const partyStore = usePartyStore()
const connection = usePartyConnection()

const input = ref('')
const inputMode = ref<'say' | 'emote' | 'ooc'>('say')
const scrollTarget = ref<HTMLElement | null>(null)

const currentAreaId = computed(() => partyStore.me?.currentAreaId ?? '')
const messages = computed(() => chatStore.forArea(currentAreaId.value))

function formatTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function classForKind(kind: string): string {
  switch (kind) {
    case 'emote': return 'italic'
    case 'ooc': return 'text-xs'
    default: return ''
  }
}

function styleForKind(kind: string): Record<string, string> {
  switch (kind) {
    case 'emote': return { color: 'var(--z-rust-300)' }
    case 'ooc': return { color: 'var(--z-toxic-500)' }
    default: return { color: 'var(--z-text-hi)' }
  }
}

function prefixForKind(kind: string, display: string): string {
  switch (kind) {
    case 'emote': return `* ${display} `
    case 'ooc': return `((OOC)) ${display}: `
    default: return `${display}: `
  }
}

function submit() {
  const body = input.value.trim()
  if (!body) return
  if (!currentAreaId.value) return
  connection.send({
    type: 'chat:send',
    kind: inputMode.value,
    body,
    areaId: currentAreaId.value
  })
  input.value = ''
}

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
      <div
        v-for="m in messages"
        :key="m.id"
        class="text-sm"
        :class="classForKind(m.kind)"
        :style="styleForKind(m.kind)"
      >
        <span
          class="text-xs font-mono-z mr-2"
          style="color: var(--z-text-lo)"
        >
          {{ formatTime(m.createdAt) }}
        </span>
        <span
          v-if="m.deletedAt"
          style="color: var(--z-text-lo); font-style: italic"
        >
          [messaggio rimosso]
        </span>
        <template v-else>
          <span>{{ prefixForKind(m.kind, m.authorDisplay) }}</span>
          <span>{{ m.body }}</span>
        </template>
      </div>
      <div
        v-if="!messages.length"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessun messaggio in questa area.
      </div>
    </div>
    <form
      class="px-4 py-3 flex gap-2"
      style="border-top: 1px solid var(--z-border)"
      @submit.prevent="submit"
    >
      <div class="flex gap-1">
        <UButton
          type="button"
          size="xs"
          :variant="inputMode === 'say' ? 'solid' : 'ghost'"
          :color="inputMode === 'say' ? 'primary' : 'neutral'"
          @click="inputMode = 'say'"
        >
          Dice
        </UButton>
        <UButton
          type="button"
          size="xs"
          :variant="inputMode === 'emote' ? 'solid' : 'ghost'"
          :color="inputMode === 'emote' ? 'primary' : 'neutral'"
          @click="inputMode = 'emote'"
        >
          Azione
        </UButton>
        <UButton
          type="button"
          size="xs"
          :variant="inputMode === 'ooc' ? 'solid' : 'ghost'"
          :color="inputMode === 'ooc' ? 'primary' : 'neutral'"
          @click="inputMode = 'ooc'"
        >
          OOC
        </UButton>
      </div>
      <UInput
        v-model="input"
        placeholder="Scrivi un messaggio…"
        class="flex-1"
        autocomplete="off"
      />
      <UButton
        type="submit"
        size="sm"
        color="primary"
      >
        Invia
      </UButton>
    </form>
  </section>
</template>
