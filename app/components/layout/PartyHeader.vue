<script setup lang="ts">
import { computed } from 'vue'
import { usePartyStore } from '~/stores/party'
import { useServerTime } from '~/composables/useServerTime'
import { useViewStore } from '~/stores/view'
import { usePartySeed } from '~/composables/usePartySeed'
import WeatherBadge from '~/components/layout/WeatherBadge.vue'
import AudioToggle from '~/components/layout/AudioToggle.vue'
import VoiceToggle from '~/components/layout/VoiceToggle.vue'
import NotificationsToggle from '~/components/layout/NotificationsToggle.vue'
import NickMenu from '~/components/layout/NickMenu.vue'

const seed = usePartySeed()
const party = usePartyStore(seed)
const time = useServerTime()
const view = useViewStore(seed)

const seedShort = computed(() => party.party?.seed.slice(0, 8) ?? '…')
const clock = computed(() => time.format())
</script>

<template>
  <header
    class="flex items-center justify-between gap-2 md:gap-4 px-3 md:px-6 py-2"
    style="background: var(--z-bg-800); border-bottom: 1px solid var(--z-border)"
  >
    <!-- Sinistra: città + seed (seed nascosto su mobile) -->
    <div class="flex items-baseline gap-2 md:gap-3 min-w-0">
      <h1
        class="text-sm md:text-lg font-semibold truncate"
        style="color: var(--z-green-300)"
      >
        {{ party.party?.cityName ?? 'Città ignota' }}
      </h1>
      <code
        class="hidden md:inline text-xs font-mono-z"
        style="color: var(--z-text-lo)"
      >{{ seedShort }}</code>
    </div>

    <!-- Centro: nav tabs (icon-only su mobile) -->
    <nav class="flex items-center gap-1">
      <button
        type="button"
        class="text-xs px-2 md:px-3 py-1.5 rounded flex items-center gap-1.5"
        :title="'Mappa'"
        :style="view.mainView === 'map'
          ? 'background: var(--z-green-700); color: var(--z-green-100)'
          : 'background: transparent; color: var(--z-text-md)'"
        @click="view.show('map')"
      >
        <UIcon
          name="i-lucide-map"
          class="size-4"
        />
        <span class="hidden md:inline">Mappa</span>
      </button>
      <button
        type="button"
        class="text-xs px-2 md:px-3 py-1.5 rounded flex items-center gap-1.5"
        :title="'Missive'"
        :style="view.mainView === 'dm'
          ? 'background: var(--z-whisper-500); color: var(--z-bg-900)'
          : 'background: transparent; color: var(--z-text-md)'"
        @click="view.show('dm')"
      >
        <UIcon
          name="i-lucide-mail"
          class="size-4"
        />
        <span class="hidden md:inline">Missive</span>
      </button>
      <button
        v-if="party.me?.role === 'master'"
        type="button"
        class="text-xs px-2 md:px-3 py-1.5 rounded flex items-center gap-1.5"
        :title="'Master'"
        :style="view.mainView === 'master'
          ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
          : 'background: transparent; color: var(--z-text-md)'"
        @click="view.show('master')"
      >
        <UIcon
          name="i-lucide-wrench"
          class="size-4"
        />
        <span class="hidden md:inline">Master</span>
      </button>
    </nav>

    <!-- Destra: meteo, ora, nickname (audio/voice/notifiche nascosti su xs) -->
    <div class="flex items-center gap-2 md:gap-4">
      <WeatherBadge />
      <div class="hidden sm:flex items-center gap-2 md:gap-4">
        <AudioToggle />
        <VoiceToggle />
        <NotificationsToggle />
      </div>
      <div
        class="hidden md:block text-xs"
        style="color: var(--z-text-md)"
      >
        <span
          v-if="time.synced.value"
          class="font-mono-z"
        >{{ clock }}</span>
        <span v-else>… sync</span>
      </div>
      <NickMenu />
    </div>
  </header>
</template>
