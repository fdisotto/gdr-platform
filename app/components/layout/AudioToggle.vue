<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { useSettingsStore } from '~/stores/settings'

const settings = useSettingsStore()
const open = ref(false)

const icon = computed(() => {
  const v = settings.weatherVolume
  if (v <= 0) return 'i-lucide-volume-x'
  if (v < 0.4) return 'i-lucide-volume'
  if (v < 0.75) return 'i-lucide-volume-1'
  return 'i-lucide-volume-2'
})

const percent = computed(() => Math.round(settings.weatherVolume * 100))

function toggleOpen() {
  open.value = !open.value
}

function close() {
  open.value = false
}

function onSlide(e: Event) {
  const target = e.target as HTMLInputElement
  settings.setWeatherVolume(Number(target.value) / 100)
}

function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

if (typeof window !== 'undefined') {
  window.addEventListener('keydown', onKeyDown)
  onBeforeUnmount(() => window.removeEventListener('keydown', onKeyDown))
}
</script>

<template>
  <div class="relative">
    <button
      type="button"
      class="text-xs px-2 py-1 rounded flex items-center gap-1"
      :title="`Volume meteo: ${percent}%`"
      :style="settings.weatherVolume > 0
        ? 'background: var(--z-green-700); color: var(--z-green-100)'
        : 'background: var(--z-bg-700); color: var(--z-text-md)'"
      @click="toggleOpen"
    >
      <UIcon
        :name="icon"
        class="size-4"
      />
      <span class="font-mono-z">{{ percent }}%</span>
    </button>
    <div
      v-if="open"
      class="absolute right-0 top-full mt-1 z-20 rounded-md p-3"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border); min-width: 200px"
      @click.stop
    >
      <div class="flex items-center gap-2 mb-2">
        <button
          type="button"
          class="text-xs px-1.5 py-0.5 rounded"
          style="background: var(--z-bg-800); color: var(--z-text-md)"
          title="Muta"
          @click="settings.muteWeather()"
        >
          <UIcon
            name="i-lucide-volume-x"
            class="size-3.5"
          />
        </button>
        <input
          type="range"
          min="0"
          max="100"
          step="1"
          :value="percent"
          class="flex-1 accent-green-600"
          @input="onSlide"
        >
        <button
          type="button"
          class="text-xs px-1.5 py-0.5 rounded"
          style="background: var(--z-bg-800); color: var(--z-text-md)"
          title="Volume massimo"
          @click="settings.setWeatherVolume(1)"
        >
          <UIcon
            name="i-lucide-volume-2"
            class="size-3.5"
          />
        </button>
      </div>
      <p
        class="text-xs"
        style="color: var(--z-text-lo)"
      >
        Audio meteo: pioggia, vento, fulmini.<br>
        Tieni a 0 per silenzio.
      </p>
    </div>
  </div>
</template>
