<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'

const seed = usePartySeed()
const connection = usePartyConnections().open(seed)

const visible = computed(() =>
  connection.status.value === 'reconnecting'
  || connection.status.value === 'connecting'
)

const pendingCount = computed(() => connection.pendingQueue.value.length)
const attempts = computed(() => connection.reconnectAttempts.value)

// Tick 500ms solo quando visibile, per aggiornare il countdown senza
// fare polling continuo a pagina stabile.
const now = ref(Date.now())
let ticker: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  ticker = setInterval(() => {
    now.value = Date.now()
  }, 500)
})
onBeforeUnmount(() => {
  if (ticker) clearInterval(ticker)
})

const countdownSec = computed(() => {
  const at = connection.reconnectAt.value
  if (!at) return null
  return Math.max(0, Math.ceil((at - now.value) / 1000))
})

const message = computed(() => {
  if (connection.status.value === 'connecting') return 'Connessione in corso…'
  if (countdownSec.value === null) return 'Riconnessione in corso…'
  if (countdownSec.value === 0) return 'Riconnessione…'
  return `Riconnessione fra ${countdownSec.value}s`
})

function onRetry() {
  connection.retryNow()
}
</script>

<template>
  <div
    v-if="visible"
    class="px-4 py-2 text-xs flex items-center justify-center gap-3 flex-wrap"
    style="background: var(--z-rust-700); color: var(--z-rust-300); border-bottom: 1px solid var(--z-border)"
  >
    <UIcon
      name="i-lucide-loader"
      class="size-4 animate-spin"
    />
    <span>{{ message }}</span>
    <span
      v-if="attempts > 0"
      class="text-xs font-mono-z"
      style="color: var(--z-text-md)"
    >
      tentativo #{{ attempts }}
    </span>
    <span
      v-if="pendingCount > 0"
      class="px-2 py-0.5 rounded text-xs font-mono-z"
      style="background: var(--z-rust-500); color: var(--z-bg-900)"
    >
      {{ pendingCount }} {{ pendingCount === 1 ? 'messaggio' : 'messaggi' }} in coda
    </span>
    <button
      v-if="connection.status.value === 'reconnecting'"
      type="button"
      class="text-xs px-2 py-0.5 rounded"
      style="background: var(--z-rust-500); color: var(--z-bg-900)"
      title="Forza la riconnessione senza aspettare il backoff"
      @click="onRetry"
    >
      Riprova ora
    </button>
  </div>
</template>
