<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { useServerTime } from '~/composables/useServerTime'
import { useViewStore } from '~/stores/view'
import WeatherBadge from '~/components/layout/WeatherBadge.vue'
import AudioToggle from '~/components/layout/AudioToggle.vue'
import VoiceToggle from '~/components/layout/VoiceToggle.vue'

const party = usePartyStore()
const time = useServerTime()
const view = useViewStore()

const seedShort = computed(() => party.party?.seed.slice(0, 8) ?? '…')
const clock = computed(() => time.format())
</script>

<template>
  <header
    class="flex items-center justify-between gap-4 px-6 py-2"
    style="background: var(--z-bg-800); border-bottom: 1px solid var(--z-border)"
  >
    <!-- Sinistra: città + seed -->
    <div class="flex items-baseline gap-3 min-w-0">
      <h1
        class="text-lg font-semibold truncate"
        style="color: var(--z-green-300)"
      >
        {{ party.party?.cityName ?? 'Città ignota' }}
      </h1>
      <code
        class="text-xs font-mono-z"
        style="color: var(--z-text-lo)"
      >{{ seedShort }}</code>
    </div>

    <!-- Centro: nav tabs -->
    <nav class="flex items-center gap-1">
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded"
        :style="view.mainView === 'map'
          ? 'background: var(--z-green-700); color: var(--z-green-100)'
          : 'background: transparent; color: var(--z-text-md)'"
        @click="view.show('map')"
      >
        🗺 Mappa
      </button>
      <button
        type="button"
        class="text-xs px-3 py-1.5 rounded"
        :style="view.mainView === 'dm'
          ? 'background: var(--z-whisper-500); color: var(--z-bg-900)'
          : 'background: transparent; color: var(--z-text-md)'"
        @click="view.show('dm')"
      >
        ✉ Missive
      </button>
    </nav>

    <!-- Destra: meteo, ora, nickname -->
    <div class="flex items-center gap-4">
      <WeatherBadge />
      <AudioToggle />
      <VoiceToggle />
      <div
        class="text-xs"
        style="color: var(--z-text-md)"
      >
        <span
          v-if="time.synced.value"
          class="font-mono-z"
        >{{ clock }}</span>
        <span v-else>… sync</span>
      </div>
      <div
        v-if="party.me"
        class="text-sm flex items-center gap-2"
      >
        <span style="color: var(--z-text-md)">{{ party.me.nickname }}</span>
        <span
          class="px-2 py-0.5 text-xs rounded"
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
