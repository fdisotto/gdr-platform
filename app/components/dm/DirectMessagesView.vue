<script setup lang="ts">
import { computed, ref } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { useViewStore } from '~/stores/view'
import { useSettingsStore } from '~/stores/settings'
import { seedFromString } from '~~/shared/seed/prng'
import { usePartyConnection } from '~/composables/usePartyConnection'

const chatStore = useChatStore()
const partyStore = usePartyStore()
const viewStore = useViewStore()
const settings = useSettingsStore()
const connection = usePartyConnection()

const NICK_COLORS = [
  '#7cbe79', '#9aa13a', '#d4965b', '#a8572a',
  '#9b81a8', '#b96565', '#4f8aa3', '#c9a66b',
  '#6ec3a6', '#c26f8e'
]

function nicknameColor(display: string): string {
  const h = seedFromString(display)
  return NICK_COLORS[h % NICK_COLORS.length]!
}

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

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const newBody = ref('')
const sendError = ref<string | null>(null)

const selectedThread = computed(() => {
  if (!selectedKey.value || !partyStore.me) return null
  return threads.value.find(t => t.key === selectedKey.value) ?? null
})

function send() {
  const body = newBody.value.trim()
  if (!body) return
  const other = selectedThread.value
  if (!other) {
    sendError.value = 'nessun destinatario selezionato'
    return
  }
  connection.send({
    type: 'chat:send',
    kind: 'dm',
    body,
    targetPlayerId: other.otherId
  })
  newBody.value = ''
  sendError.value = null
}
</script>

<template>
  <section
    class="w-full flex"
    style="height: calc(55vh + 45vh); background: var(--z-bg-900)"
  >
    <!-- Lista conversazioni (inbox) -->
    <aside
      class="w-80 flex flex-col"
      style="border-right: 1px solid var(--z-border); background: var(--z-bg-800)"
    >
      <header
        class="px-4 py-3"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <h3
          class="text-sm font-semibold"
          style="color: var(--z-green-300)"
        >
          Missive
        </h3>
        <p
          class="text-xs"
          style="color: var(--z-text-lo)"
        >
          Inbox di messaggi privati
        </p>
      </header>
      <ul class="flex-1 overflow-y-auto">
        <li
          v-for="t in threads"
          :key="t.key"
          class="px-4 py-3 cursor-pointer"
          :style="selectedKey === t.key
            ? 'background: var(--z-whisper-500); color: var(--z-bg-900)'
            : 'background: transparent'"
          @click="openThread(t.key)"
        >
          <div class="flex items-baseline justify-between gap-2">
            <span
              class="text-sm font-semibold"
              :style="selectedKey === t.key
                ? undefined
                : (settings.colorNicknames ? { color: nicknameColor(t.otherNickname) } : { color: 'var(--z-text-hi)' })"
            >
              {{ t.otherNickname }}
            </span>
            <span
              v-if="t.lastMessage"
              class="text-xs font-mono-z"
              style="opacity: 0.7"
            >
              {{ formatDate(t.lastMessage.createdAt) }}
            </span>
          </div>
          <div
            v-if="t.lastMessage"
            class="text-xs truncate mt-1"
            style="opacity: 0.75"
          >
            {{ t.lastMessage.body }}
          </div>
        </li>
        <li
          v-if="!threads.length"
          class="text-xs italic px-4 py-3"
          style="color: var(--z-text-lo)"
        >
          Nessuna missiva ricevuta.
        </li>
      </ul>
      <div style="border-top: 1px solid var(--z-border)">
        <h4
          class="text-xs uppercase tracking-wide px-4 pt-3 pb-1"
          style="color: var(--z-text-md)"
        >
          Avvia corrispondenza
        </h4>
        <ul class="pb-2">
          <li
            v-for="p in otherPlayers"
            :key="p.id"
            class="px-4 py-1 text-xs cursor-pointer hover:opacity-80"
            :style="settings.colorNicknames ? { color: nicknameColor(p.nickname) } : { color: 'var(--z-green-300)' }"
            @click="startNewWith(p.id)"
          >
            + {{ p.nickname }}
          </li>
        </ul>
      </div>
    </aside>

    <!-- Missive view (letters) -->
    <div class="flex-1 flex flex-col overflow-hidden">
      <div
        v-if="selectedThread"
        class="px-6 py-3"
        style="border-bottom: 1px solid var(--z-border); background: var(--z-bg-800)"
      >
        <p
          class="text-xs uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Corrispondenza con
        </p>
        <p
          class="text-lg font-semibold"
          :style="settings.colorNicknames ? { color: nicknameColor(selectedThread.otherNickname) } : { color: 'var(--z-green-300)' }"
        >
          {{ selectedThread.otherNickname }}
        </p>
      </div>
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <article
          v-for="m in selectedMessages"
          :key="m.id"
          class="rounded-md p-4"
          :style="m.authorPlayerId === partyStore.me?.id
            ? 'background: var(--z-bg-800); border-left: 3px solid var(--z-green-500)'
            : 'background: var(--z-bg-700); border-left: 3px solid var(--z-whisper-500)'"
        >
          <header class="flex items-baseline justify-between mb-2">
            <span
              class="text-sm font-semibold"
              :style="settings.colorNicknames ? { color: nicknameColor(m.authorDisplay) } : { color: 'var(--z-text-hi)' }"
            >
              {{ m.authorDisplay }}
            </span>
            <span
              class="text-xs font-mono-z"
              style="color: var(--z-text-lo)"
            >
              {{ formatDate(m.createdAt) }}
            </span>
          </header>
          <p
            v-if="m.deletedAt"
            class="italic"
            style="color: var(--z-text-lo)"
          >
            [missiva rimossa]
          </p>
          <p
            v-else
            style="color: var(--z-text-hi); white-space: pre-wrap"
          >
            {{ m.body }}
          </p>
        </article>
        <p
          v-if="selectedKey && !selectedMessages.length"
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Nessuna missiva in questa corrispondenza.
        </p>
        <p
          v-else-if="!selectedKey"
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Seleziona una conversazione dalla lista o avvia una nuova corrispondenza.
        </p>
      </div>

      <!-- Composer nuova missiva -->
      <div
        v-if="selectedThread"
        class="px-6 py-3 flex gap-2 items-start"
        style="border-top: 1px solid var(--z-border); background: var(--z-bg-800)"
      >
        <textarea
          v-model="newBody"
          class="flex-1 rounded px-3 py-2 text-sm resize-none"
          style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); min-height: 60px; outline: none"
          placeholder="Scrivi una missiva…"
          @keydown.enter.exact.prevent="send"
        />
        <UButton
          size="sm"
          color="primary"
          @click="send"
        >
          Invia
        </UButton>
      </div>
      <p
        v-if="sendError"
        class="px-6 pb-2 text-xs"
        style="color: var(--z-blood-300)"
      >
        {{ sendError }}
      </p>
    </div>
  </section>
</template>
