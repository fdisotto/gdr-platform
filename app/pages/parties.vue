<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { useFeedbackStore } from '~/stores/feedback'
import { relativeTime } from '~/composables/useRelativeTime'

useSeoMeta({ title: 'GDR Zombi — Sfoglia party' })

interface BrowserItem {
  seed: string
  cityName: string
  visibility: 'public' | 'private'
  joinPolicy: 'auto' | 'request'
  memberCount: number
  masterDisplays: string[]
  lastActivityAt: number
  isMember: boolean
  hasPendingRequest: boolean
}

interface BrowserResponse {
  items: BrowserItem[]
  nextCursor: string | null
}

const router = useRouter()
const authStore = useAuthStore()
const feedback = useErrorFeedback()
const feedbackStore = useFeedbackStore()

if (!authStore.loaded) {
  await authStore.fetchMe()
}

const items = ref<BrowserItem[]>([])
const nextCursor = ref<string | null>(null)
const loading = ref(false)
const initialDone = ref(false)

const search = ref('')
const sort = ref<'lastActivity' | 'members' | 'recent'>('lastActivity')
const filterAuto = ref(false)
const filterWithSlots = ref(false)
const filterMine = ref(false)

const sentinel = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

async function fetchPage(reset: boolean) {
  if (loading.value) return
  loading.value = true
  try {
    const query: Record<string, string> = {
      sort: sort.value,
      limit: '20'
    }
    if (search.value) query.q = search.value
    if (filterAuto.value) query.auto = '1'
    if (filterWithSlots.value) query.withSlots = '1'
    if (filterMine.value) query.mine = '1'
    if (!reset && nextCursor.value) query.cursor = nextCursor.value
    const res = await $fetch<BrowserResponse>('/api/parties', { query })
    items.value = reset ? res.items : [...items.value, ...res.items]
    nextCursor.value = res.nextCursor
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    loading.value = false
    initialDone.value = true
  }
}

function reload() {
  nextCursor.value = null
  fetchPage(true)
}

// Debounce su ricerca per non spammare il server.
let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(search, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(reload, 250)
})
watch([sort, filterAuto, filterWithSlots, filterMine], reload)

onMounted(() => {
  reload()
  if (typeof window === 'undefined') return
  observer = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (e.isIntersecting && nextCursor.value && !loading.value) {
        fetchPage(false)
      }
    }
  }, { rootMargin: '200px' })
  if (sentinel.value) observer.observe(sentinel.value)
})

onUnmounted(() => {
  observer?.disconnect()
  if (searchTimer) clearTimeout(searchTimer)
})

watch(sentinel, (el) => {
  if (observer && el) observer.observe(el)
})

// Modal "richiesta accesso"
const requestModal = ref<{ open: boolean, seed: string, cityName: string, displayName: string, message: string, busy: boolean }>({
  open: false, seed: '', cityName: '', displayName: '', message: '', busy: false
})
function openRequest(item: BrowserItem) {
  requestModal.value = {
    open: true,
    seed: item.seed,
    cityName: item.cityName,
    displayName: authStore.identity?.username ?? '',
    message: '',
    busy: false
  }
}
async function submitRequest() {
  if (requestModal.value.busy) return
  requestModal.value.busy = true
  try {
    await $fetch(`/api/parties/${requestModal.value.seed}/join-requests`, {
      method: 'POST',
      body: {
        displayName: requestModal.value.displayName,
        message: requestModal.value.message || undefined
      }
    })
    feedbackStore.pushToast({ level: 'info', title: 'Richiesta inviata' })
    requestModal.value.open = false
    reload()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    requestModal.value.busy = false
  }
}

// Modal "crea party"
const createModal = ref<{ open: boolean, displayName: string, cityName: string, visibility: 'public' | 'private', joinPolicy: 'auto' | 'request', busy: boolean }>({
  open: false, displayName: '', cityName: '', visibility: 'private', joinPolicy: 'request', busy: false
})
function openCreate() {
  createModal.value = {
    open: true,
    displayName: authStore.identity?.username ?? '',
    cityName: '',
    visibility: 'private',
    joinPolicy: 'request',
    busy: false
  }
}
async function submitCreate() {
  if (createModal.value.busy) return
  createModal.value.busy = true
  try {
    const body: Record<string, unknown> = {
      displayName: createModal.value.displayName,
      visibility: createModal.value.visibility,
      joinPolicy: createModal.value.joinPolicy
    }
    if (createModal.value.cityName) body.cityName = createModal.value.cityName
    const res = await $fetch<{ seed: string }>('/api/parties', {
      method: 'POST',
      body
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdr:my-parties-changed'))
    }
    createModal.value.open = false
    await router.push(`/party/${res.seed}`)
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    createModal.value.busy = false
  }
}

async function autoJoin(item: BrowserItem) {
  try {
    await $fetch(`/api/parties/${item.seed}/join`, {
      method: 'POST',
      body: { displayName: authStore.identity?.username ?? '' }
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdr:my-parties-changed'))
    }
    await router.push(`/party/${item.seed}`)
  } catch (err) {
    feedback.reportFromError(err)
  }
}

const canRender = computed(() => authStore.isUser)
</script>

<template>
  <main class="flex-1 min-h-0 flex flex-col p-6 gap-4 overflow-hidden">
    <header class="flex items-center justify-between gap-4">
      <h1
        class="text-2xl font-bold"
        style="color: var(--z-green-300)"
      >
        Sfoglia party
      </h1>
      <UButton
        color="primary"
        @click="openCreate"
      >
        Crea nuova party
      </UButton>
    </header>

    <div
      class="flex flex-wrap items-center gap-3 text-sm"
      style="color: var(--z-text-md)"
    >
      <input
        v-model="search"
        type="search"
        placeholder="Cerca per nome città"
        class="px-3 py-1.5 rounded text-sm font-mono-z flex-1 min-w-40"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
      >
      <label class="inline-flex items-center gap-1.5 text-xs">
        <input
          v-model="filterAuto"
          type="checkbox"
        > solo auto-join
      </label>
      <label class="inline-flex items-center gap-1.5 text-xs">
        <input
          v-model="filterWithSlots"
          type="checkbox"
        > posti liberi
      </label>
      <label class="inline-flex items-center gap-1.5 text-xs">
        <input
          v-model="filterMine"
          type="checkbox"
        > membro
      </label>
      <select
        v-model="sort"
        class="px-2 py-1 rounded text-xs"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
      >
        <option value="lastActivity">
          Ultima attività
        </option>
        <option value="members">
          Più popolate
        </option>
        <option value="recent">
          Recenti
        </option>
      </select>
    </div>

    <ul
      v-if="canRender"
      class="flex-1 min-h-0 overflow-y-auto space-y-2 pr-1"
    >
      <li
        v-for="it in items"
        :key="it.seed"
        class="flex items-center justify-between gap-3 p-3 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <NuxtLink
              :to="`/party/${it.seed}`"
              class="font-semibold truncate"
              style="color: var(--z-green-300)"
            >
              {{ it.cityName }}
            </NuxtLink>
            <span
              v-if="it.visibility === 'private'"
              class="text-[10px] uppercase tracking-wide px-1.5 rounded"
              style="background: var(--z-bg-700); color: var(--z-text-md)"
            >privata</span>
            <span
              class="text-[10px] uppercase tracking-wide px-1.5 rounded"
              :style="it.joinPolicy === 'auto'
                ? 'background: var(--z-green-700); color: var(--z-green-100)'
                : 'background: var(--z-rust-700); color: var(--z-rust-300)'"
            >{{ it.joinPolicy === 'auto' ? 'auto' : 'richiesta' }}</span>
          </div>
          <div
            class="text-xs mt-1"
            style="color: var(--z-text-md)"
          >
            {{ it.memberCount }}/30 membri ·
            {{ relativeTime(it.lastActivityAt) }} ·
            <span style="color: var(--z-text-lo)">master:</span>
            {{ it.masterDisplays.join(', ') || '—' }}
          </div>
        </div>

        <div class="shrink-0">
          <NuxtLink
            v-if="it.isMember"
            :to="`/party/${it.seed}`"
            class="text-xs px-3 py-1.5 rounded"
            style="background: var(--z-bg-700); color: var(--z-text-md)"
          >
            Già membro
          </NuxtLink>
          <button
            v-else-if="it.joinPolicy === 'auto'"
            type="button"
            class="text-xs px-3 py-1.5 rounded"
            style="background: var(--z-green-700); color: var(--z-green-100)"
            @click="autoJoin(it)"
          >
            Entra
          </button>
          <button
            v-else-if="it.hasPendingRequest"
            type="button"
            disabled
            class="text-xs px-3 py-1.5 rounded opacity-60 cursor-not-allowed"
            style="background: var(--z-bg-700); color: var(--z-text-md)"
          >
            Richiesta in attesa
          </button>
          <button
            v-else
            type="button"
            class="text-xs px-3 py-1.5 rounded"
            style="background: var(--z-rust-700); color: var(--z-rust-300)"
            @click="openRequest(it)"
          >
            Richiedi
          </button>
        </div>
      </li>
      <li
        v-if="initialDone && items.length === 0"
        class="text-sm italic text-center py-4"
        style="color: var(--z-text-lo)"
      >
        Nessuna party trovata.
      </li>
      <li
        ref="sentinel"
        class="h-px"
      />
      <li
        v-if="loading"
        class="text-xs text-center py-2"
        style="color: var(--z-text-md)"
      >
        Caricamento…
      </li>
    </ul>
    <p
      v-else
      class="text-sm italic"
      style="color: var(--z-text-md)"
    >
      Devi essere autenticato per sfogliare le party.
      <NuxtLink
        to="/login"
        style="color: var(--z-green-300); text-decoration: underline"
      >
        Vai al login
      </NuxtLink>.
    </p>

    <!-- Modal richiesta accesso -->
    <div
      v-if="requestModal.open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background: rgba(0,0,0,0.7)"
      @click.self="requestModal.open = false"
    >
      <form
        class="w-full max-w-sm rounded p-4 space-y-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @submit.prevent="submitRequest"
      >
        <h2
          class="font-semibold"
          style="color: var(--z-green-300)"
        >
          Richiedi accesso a {{ requestModal.cityName }}
        </h2>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Display name</label>
          <input
            v-model="requestModal.displayName"
            type="text"
            required
            minlength="2"
            maxlength="24"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Messaggio (opzionale)</label>
          <textarea
            v-model="requestModal.message"
            maxlength="500"
            rows="3"
            class="w-full px-3 py-2 rounded text-sm"
            style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          />
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="requestModal.open = false"
          >
            Annulla
          </UButton>
          <UButton
            type="submit"
            color="primary"
            :loading="requestModal.busy"
          >
            Invia richiesta
          </UButton>
        </div>
      </form>
    </div>

    <!-- Modal crea party -->
    <div
      v-if="createModal.open"
      class="fixed inset-0 z-50 flex items-center justify-center p-4"
      style="background: rgba(0,0,0,0.7)"
      @click.self="createModal.open = false"
    >
      <form
        class="w-full max-w-sm rounded p-4 space-y-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @submit.prevent="submitCreate"
      >
        <h2
          class="font-semibold"
          style="color: var(--z-green-300)"
        >
          Crea nuova party
        </h2>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Display name (master)</label>
          <input
            v-model="createModal.displayName"
            type="text"
            required
            minlength="2"
            maxlength="24"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Nome città (opzionale)</label>
          <input
            v-model="createModal.cityName"
            type="text"
            maxlength="64"
            placeholder="autogenerato se vuoto"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Visibilità</label>
            <select
              v-model="createModal.visibility"
              class="w-full px-2 py-2 rounded text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
              <option value="private">
                Privata
              </option>
              <option value="public">
                Pubblica
              </option>
            </select>
          </div>
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Accesso</label>
            <select
              v-model="createModal.joinPolicy"
              class="w-full px-2 py-2 rounded text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
              <option value="request">
                Richiesta
              </option>
              <option value="auto">
                Automatico
              </option>
            </select>
          </div>
        </div>
        <div class="flex justify-end gap-2 pt-2">
          <UButton
            type="button"
            color="neutral"
            variant="ghost"
            @click="createModal.open = false"
          >
            Annulla
          </UButton>
          <UButton
            type="submit"
            color="primary"
            :loading="createModal.busy"
          >
            Crea
          </UButton>
        </div>
      </form>
    </div>
  </main>
</template>
