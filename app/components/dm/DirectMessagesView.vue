<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useChatStore } from '~/stores/chat'
import { usePartyStore } from '~/stores/party'
import { useViewStore } from '~/stores/view'
import { usePartySeed } from '~/composables/usePartySeed'
import { useSettingsStore } from '~/stores/settings'
import { useFeedbackStore } from '~/stores/feedback'
import { seedFromString } from '~~/shared/seed/prng'
import { usePartyConnections } from '~/composables/usePartyConnections'

const seed = usePartySeed()
const chatStore = useChatStore(seed)
const partyStore = usePartyStore(seed)
const viewStore = useViewStore(seed)
const settings = useSettingsStore()
const feedback = useFeedbackStore()
const connection = usePartyConnections().open(seed)

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

const selectedThread = computed(() => {
  if (!selectedKey.value || !partyStore.me) return null
  return threads.value.find(t => t.key === selectedKey.value) ?? null
})

function openThread(threadKey: string) {
  viewStore.openThread(threadKey)
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Composer "nuova missiva" ────────────────────────────────────────────
// Modal con destinatario + oggetto + corpo. Il thread si crea
// implicitamente al primo messaggio (server lo memorizza con subject).
const showNew = ref(false)
const newToId = ref('')
const newSubject = ref('')
const newFirstBody = ref('')
const newError = ref<string | null>(null)

// Combobox cercabile per il destinatario.
const newToQuery = ref('')
const newToFocused = ref(false)
const filteredRecipients = computed(() => {
  const q = newToQuery.value.trim().toLowerCase()
  const list = otherPlayers.value
  if (!q) return list
  return list.filter(p => p.nickname.toLowerCase().includes(q))
})
const newToNickname = computed(() =>
  otherPlayers.value.find(p => p.id === newToId.value)?.nickname ?? null
)
function pickRecipient(id: string, nickname: string) {
  newToId.value = id
  newToQuery.value = nickname
  newToFocused.value = false
}

function openNew(prefillToId?: string) {
  newToId.value = prefillToId ?? ''
  newToQuery.value = prefillToId
    ? (otherPlayers.value.find(p => p.id === prefillToId)?.nickname ?? '')
    : ''
  newToFocused.value = false
  newSubject.value = ''
  newFirstBody.value = ''
  newError.value = null
  showNew.value = true
}
function cancelNew() {
  showNew.value = false
}
function submitNew() {
  const subj = newSubject.value.trim().slice(0, 64)
  const body = newFirstBody.value.trim()
  if (!newToId.value) {
    newError.value = 'Scegli un destinatario.'
    return
  }
  if (!subj) {
    newError.value = 'L\'oggetto della missiva e\' obbligatorio.'
    return
  }
  if (!body) {
    newError.value = 'Scrivi il corpo della missiva.'
    return
  }
  connection.send({
    type: 'chat:send',
    kind: 'dm',
    body,
    targetPlayerId: newToId.value,
    subject: subj
  })
  // Salta sul thread appena creato (anche se l'echo del server arrivera'
  // a stretto giro): la threadKey e' deterministica dai dati locali.
  if (partyStore.me) {
    const key = chatStore.threadKey(partyStore.me.id, newToId.value, subj)
    viewStore.openThread(key)
  }
  feedback.pushToast({ level: 'info', title: 'Missiva inviata' })
  showNew.value = false
}

// ── Composer per thread esistente ───────────────────────────────────────
const newBody = ref('')
const sendError = ref<string | null>(null)
const loadingMore = ref(false)
const HISTORY_PAGE_SIZE = 50

const hasMoreHistory = computed(() => {
  if (!selectedKey.value) return false
  return chatStore.threadHasMoreFor(selectedKey.value)
})

function loadMoreHistory() {
  if (loadingMore.value || !selectedKey.value) return
  const oldest = selectedMessages.value[0]
  const before = oldest?.createdAt ?? Date.now()
  loadingMore.value = true
  connection.send({
    type: 'chat:history-before',
    threadKey: selectedKey.value,
    before,
    limit: HISTORY_PAGE_SIZE
  })
}

watch(selectedMessages, () => {
  loadingMore.value = false
}, { deep: true })

function send() {
  const body = newBody.value.trim()
  if (!body) return
  const t = selectedThread.value
  if (!t) {
    sendError.value = 'Nessun thread selezionato.'
    return
  }
  connection.send({
    type: 'chat:send',
    kind: 'dm',
    body,
    targetPlayerId: t.otherId,
    subject: t.subject
  })
  newBody.value = ''
  sendError.value = null
}
</script>

<template>
  <section
    class="w-full flex flex-1 min-h-0"
    style="background: var(--z-bg-900)"
  >
    <!-- Sidebar lista thread -->
    <aside
      class="flex flex-col w-full md:w-80"
      :class="selectedKey ? 'hidden md:flex' : 'flex'"
      style="border-right: 1px solid var(--z-border); background: var(--z-bg-800)"
    >
      <header
        class="px-4 py-3 flex items-center justify-between gap-2"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <div>
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
            Thread per oggetto
          </p>
        </div>
        <UButton
          size="xs"
          color="primary"
          icon="i-lucide-pencil"
          @click="openNew()"
        >
          Nuova
        </UButton>
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
              class="text-sm font-semibold truncate"
              :style="selectedKey === t.key
                ? undefined
                : (settings.colorNicknames ? { color: nicknameColor(t.otherNickname) } : { color: 'var(--z-text-hi)' })"
            >
              {{ t.otherNickname }}
            </span>
            <span
              v-if="t.lastMessage"
              class="text-xs font-mono-z shrink-0"
              style="opacity: 0.7"
            >
              {{ formatDate(t.lastMessage.createdAt) }}
            </span>
          </div>
          <div
            class="text-xs truncate mt-0.5"
            style="opacity: 0.85"
          >
            <span
              v-if="t.subject"
              style="font-weight: 600"
            >📜 {{ t.subject }}</span>
            <span
              v-else
              style="font-style: italic; opacity: 0.6"
            >(senza oggetto)</span>
          </div>
          <div
            v-if="t.lastMessage"
            class="text-xs truncate mt-0.5"
            style="opacity: 0.65"
          >
            {{ t.lastMessage.body }}
          </div>
        </li>
        <li
          v-if="!threads.length"
          class="text-xs italic px-4 py-3"
          style="color: var(--z-text-lo)"
        >
          Nessuna missiva. Apri "Nuova" per iniziare.
        </li>
      </ul>
    </aside>

    <!-- View del thread selezionato -->
    <div
      class="flex-1 flex flex-col overflow-hidden"
      :class="selectedKey ? 'flex' : 'hidden md:flex'"
    >
      <div
        v-if="selectedThread"
        class="px-4 md:px-6 py-3 flex items-center gap-3"
        style="border-bottom: 1px solid var(--z-border); background: var(--z-bg-800)"
      >
        <button
          type="button"
          class="md:hidden text-sm px-2 py-1 rounded"
          title="Torna alla lista"
          style="background: var(--z-bg-700); color: var(--z-text-md)"
          @click="viewStore.selectedThreadKey = null"
        >
          ←
        </button>
        <div class="flex-1 min-w-0">
          <p
            class="text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Corrispondenza con
            <strong
              :style="settings.colorNicknames ? { color: nicknameColor(selectedThread.otherNickname) } : { color: 'var(--z-green-300)' }"
            >{{ selectedThread.otherNickname }}</strong>
          </p>
          <p
            v-if="selectedThread.subject"
            class="text-base md:text-lg font-semibold truncate"
            style="color: var(--z-rust-300)"
          >
            📜 {{ selectedThread.subject }}
          </p>
          <p
            v-else
            class="text-base md:text-lg italic truncate"
            style="color: var(--z-text-lo)"
          >
            (thread senza oggetto)
          </p>
        </div>
      </div>
      <div class="flex-1 overflow-y-auto p-6 space-y-4">
        <div
          v-if="selectedKey && hasMoreHistory"
          class="flex justify-center"
        >
          <button
            type="button"
            class="text-xs px-3 py-1 rounded"
            :disabled="loadingMore"
            :style="loadingMore
              ? 'background: var(--z-bg-700); color: var(--z-text-lo); cursor: wait'
              : 'background: var(--z-bg-700); color: var(--z-text-md); cursor: pointer'"
            @click="loadMoreHistory"
          >
            {{ loadingMore ? 'Caricamento…' : '↑ Carica missive precedenti' }}
          </button>
        </div>
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
          Seleziona un thread dalla lista o apri "Nuova" per scriverne uno.
        </p>
      </div>

      <!-- Composer reply al thread aperto -->
      <div
        v-if="selectedThread"
        class="px-6 py-3 flex gap-2 items-start"
        style="border-top: 1px solid var(--z-border); background: var(--z-bg-800)"
      >
        <textarea
          v-model="newBody"
          class="flex-1 rounded px-3 py-2 text-sm resize-none"
          style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); min-height: 60px; outline: none"
          placeholder="Rispondi al thread…"
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
        class="px-6 pb-3 text-xs"
        style="color: var(--z-blood-300)"
      >
        {{ sendError }}
      </p>
    </div>

    <!-- Modal "nuova missiva" -->
    <div
      v-if="showNew"
      class="fixed inset-0 z-30 flex items-center justify-center p-4"
      style="background: rgba(0, 0, 0, 0.55)"
      @click.self="cancelNew"
    >
      <div
        class="w-full max-w-md p-5 rounded-md space-y-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @click.stop
      >
        <h3
          class="text-sm font-semibold"
          style="color: var(--z-whisper-300)"
        >
          ✉ Nuova missiva
        </h3>
        <div class="relative">
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Destinatario</label>
          <input
            v-model="newToQuery"
            type="text"
            placeholder="Cerca un player…"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            @focus="newToFocused = true"
            @input="newToId = ''"
          >
          <ul
            v-if="newToFocused && filteredRecipients.length > 0"
            class="absolute z-10 left-0 right-0 mt-1 max-h-48 overflow-y-auto rounded text-sm"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border)"
          >
            <li
              v-for="p in filteredRecipients"
              :key="p.id"
              class="px-3 py-1.5 cursor-pointer hover:bg-black/30"
              :style="newToId === p.id ? 'background: var(--z-whisper-500); color: var(--z-bg-900)' : 'color: var(--z-text-hi)'"
              @mousedown.prevent="pickRecipient(p.id, p.nickname)"
            >
              {{ p.nickname }}
            </li>
          </ul>
          <p
            v-if="newToFocused && filteredRecipients.length === 0"
            class="absolute z-10 left-0 right-0 mt-1 px-3 py-2 text-xs italic rounded"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-lo)"
          >
            Nessun player corrisponde a "{{ newToQuery }}"
          </p>
          <p
            v-if="newToId && newToNickname && newToQuery !== newToNickname"
            class="text-xs mt-1"
            style="color: var(--z-green-300)"
          >
            ✓ Selezionato: {{ newToNickname }}
          </p>
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Oggetto <span style="color: var(--z-blood-300)">*</span></label>
          <input
            v-model="newSubject"
            type="text"
            maxlength="64"
            placeholder="Es. Piano per stanotte"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Messaggio</label>
          <textarea
            v-model="newFirstBody"
            rows="4"
            class="w-full px-3 py-2 rounded text-sm resize-none"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          />
        </div>
        <p
          v-if="newError"
          class="text-xs"
          style="color: var(--z-blood-300)"
        >
          {{ newError }}
        </p>
        <div class="flex justify-end gap-2 pt-1">
          <UButton
            size="sm"
            variant="ghost"
            @click="cancelNew"
          >
            Annulla
          </UButton>
          <UButton
            size="sm"
            color="primary"
            @click="submitNew"
          >
            Invia
          </UButton>
        </div>
      </div>
    </div>
  </section>
</template>
