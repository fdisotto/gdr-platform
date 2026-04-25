<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useCrossPartyNotifications } from '~/composables/useCrossPartyNotifications'

interface MyPartyItem {
  seed: string
  cityName: string
  lastActivityAt: number
}

interface BrowserResponse {
  items: Array<{ seed: string, cityName: string, lastActivityAt: number, isMember: boolean }>
  nextCursor: string | null
}

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const cross = useCrossPartyNotifications()

const myParties = ref<MyPartyItem[]>([])
const overflowOpen = ref(false)

const visibleSeed = computed(() => {
  const m = route.path.match(/^\/party\/([^/]+)/)
  return m ? m[1]! : null
})

// Visibile solo per utenti autenticati e fuori dalle pagine "guest"/admin.
// Su tutte le altre pagine la barra resta utile come switcher rapido.
const HIDDEN_PREFIXES = ['/login', '/register', '/admin']
const visible = computed(() => {
  if (!auth.identity) return false
  if (route.path === '/') return false
  for (const p of HIDDEN_PREFIXES) {
    if (route.path === p || route.path.startsWith(p + '/')) return false
  }
  return true
})

async function refresh() {
  if (!auth.identity) {
    myParties.value = []
    return
  }
  try {
    const res = await $fetch<BrowserResponse>('/api/parties', {
      query: { mine: '1', limit: 20 }
    })
    myParties.value = res.items
      .filter(i => i.isMember)
      .map(i => ({
        seed: i.seed,
        cityName: i.cityName,
        lastActivityAt: i.lastActivityAt
      }))
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
    // Aggiorna i nomi citati nelle notifiche cross-party.
    for (const p of myParties.value) cross.setCityName(p.seed, p.cityName)
  } catch { /* in caso di errore lasciamo lista corrente */ }
}

onMounted(() => {
  refresh()
})

// Listen su eventi app-level: home/parties/master tab, master-list-leave,
// master-archive emettono `gdr:my-parties-changed` su window per forzare
// refresh asincrono della tab bar.
if (typeof window !== 'undefined') {
  window.addEventListener('gdr:my-parties-changed', () => refresh())
}

// Refresh anche su cambio rotta: quando vai su /party/<seed> e ti unisci,
// il route cambia e vogliamo riallineare la lista.
watch(() => route.path, () => {
  refresh()
})

function truncate(s: string, n: number): string {
  if (s.length <= n) return s
  return s.slice(0, n - 1) + '…'
}

function goTo(seed: string) {
  overflowOpen.value = false
  router.push(`/party/${seed}`).catch(() => { /* noop */ })
}

const visibleTabs = computed(() => myParties.value.slice(0, 5))
const overflowTabs = computed(() => myParties.value.slice(5))
</script>

<template>
  <nav
    v-if="visible"
    class="sticky top-0 z-30 flex items-center gap-1 px-2 overflow-x-auto"
    style="background: var(--z-bg-900); border-bottom: 1px solid var(--z-border); height: 36px"
  >
    <button
      v-for="p in visibleTabs"
      :key="p.seed"
      type="button"
      class="text-xs px-2 py-1 rounded inline-flex items-center gap-1.5 whitespace-nowrap"
      :title="p.cityName"
      :style="visibleSeed === p.seed
        ? 'background: var(--z-green-700); color: var(--z-green-100)'
        : 'background: var(--z-bg-700); color: var(--z-text-md)'"
      @click="goTo(p.seed)"
    >
      <span>{{ truncate(p.cityName, 12) }}</span>
      <span
        v-if="visibleSeed !== p.seed && cross.directFor(p.seed) > 0"
        class="rounded-full px-1.5 text-[10px] leading-4 font-semibold"
        style="background: var(--z-whisper-500); color: var(--z-bg-900)"
      >{{ cross.directFor(p.seed) }}</span>
      <span
        v-else-if="visibleSeed !== p.seed && cross.unreadFor(p.seed) > 0"
        class="rounded-full px-1.5 text-[10px] leading-4 font-semibold"
        style="background: var(--z-rust-700); color: var(--z-rust-300)"
      >{{ cross.unreadFor(p.seed) }}</span>
    </button>

    <div
      v-if="overflowTabs.length > 0"
      class="relative"
    >
      <button
        type="button"
        class="text-xs px-2 py-1 rounded"
        style="background: var(--z-bg-700); color: var(--z-text-md)"
        :title="`Altre ${overflowTabs.length} party`"
        @click="overflowOpen = !overflowOpen"
      >
        …
      </button>
      <div
        v-if="overflowOpen"
        class="absolute right-0 top-full mt-1 rounded shadow-lg z-50 py-1 min-w-40"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <button
          v-for="p in overflowTabs"
          :key="p.seed"
          type="button"
          class="block w-full text-left text-xs px-3 py-1.5 hover:brightness-125"
          style="color: var(--z-text-md)"
          @click="goTo(p.seed)"
        >
          {{ truncate(p.cityName, 24) }}
        </button>
      </div>
    </div>

    <div class="flex-1" />

    <button
      type="button"
      class="text-xs px-2 py-1 rounded"
      title="Sfoglia party"
      style="background: var(--z-bg-700); color: var(--z-text-md)"
      @click="router.push('/parties').catch(() => {})"
    >
      +
    </button>
  </nav>
</template>
