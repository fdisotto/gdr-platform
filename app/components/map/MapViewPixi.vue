<script setup lang="ts">
import type { PartyMapPublic } from '~~/shared/protocol/ws'

// T19 placeholder visivo: T21 popolerà questo componente con
// PIXI.Application e rendering canvas.
defineProps<{
  map: PartyMapPublic | null
}>()
</script>

<template>
  <div
    class="flex items-center justify-center h-full"
    style="background: var(--z-bg-800); color: var(--z-text-md)"
  >
    <p class="text-sm font-mono-z">
      Render PIXI in arrivo (T21)
    </p>
  </div>
</template>
