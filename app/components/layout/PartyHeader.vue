<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { useServerTime } from '~/composables/useServerTime'
import WeatherBadge from '~/components/layout/WeatherBadge.vue'

const party = usePartyStore()
const time = useServerTime()

const seedShort = computed(() => party.party?.seed.slice(0, 8) ?? '…')
</script>

<template>
  <header
    class="flex items-center justify-between gap-4 px-6 py-3"
    style="background: var(--z-bg-800); border-bottom: 1px solid var(--z-border)"
  >
    <div class="flex items-baseline gap-3">
      <h1
        class="text-lg font-semibold"
        style="color: var(--z-green-300)"
      >
        {{ party.party?.cityName ?? 'Città ignota' }}
      </h1>
      <code
        class="text-xs font-mono-z"
        style="color: var(--z-text-lo)"
      >{{ seedShort }}</code>
    </div>
    <div class="flex items-baseline gap-4">
      <WeatherBadge />
      <div
        class="text-xs"
        style="color: var(--z-text-md)"
      >
        <span
          v-if="time.synced.value"
          class="font-mono-z"
        >{{ time.format() }}</span>
        <span v-else>… sync</span>
      </div>
      <div
        v-if="party.me"
        class="text-sm"
      >
        <span style="color: var(--z-text-md)">{{ party.me.nickname }}</span>
        <span
          class="ml-2 px-2 py-0.5 text-xs rounded"
          :style="party.me.role === 'master'
            ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
            : 'background: var(--z-bg-700); color: var(--z-text-md)'"
        >
          {{ party.me.role }}
        </span>
      </div>
    </div>
  </header>
</template>
