<script setup lang="ts">
import { computed } from 'vue'
import { usePartyConnection } from '~/composables/usePartyConnection'

const connection = usePartyConnection()

const visible = computed(() =>
  connection.status.value === 'reconnecting'
  || connection.status.value === 'connecting'
)

const message = computed(() => {
  if (connection.status.value === 'connecting') return 'Connessione in corso…'
  return 'Riconnessione in corso…'
})

const pendingCount = computed(() => connection.pendingQueue.value.length)
</script>

<template>
  <div
    v-if="visible"
    class="px-4 py-2 text-xs flex items-center justify-center gap-3"
    style="background: var(--z-rust-700); color: var(--z-rust-300); border-bottom: 1px solid var(--z-border)"
  >
    <UIcon
      name="i-lucide-loader"
      class="size-4 animate-spin"
    />
    <span>{{ message }}</span>
    <span
      v-if="pendingCount > 0"
      class="px-2 py-0.5 rounded text-xs font-mono-z"
      style="background: var(--z-rust-500); color: var(--z-bg-900)"
    >
      {{ pendingCount }} in coda
    </span>
  </div>
</template>
