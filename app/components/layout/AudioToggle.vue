<script setup lang="ts">
import { useSettingsStore } from '~/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <button
    type="button"
    class="text-xs px-2 py-1 rounded"
    :title="settings.weatherAudio ? 'Disattiva audio meteo' : 'Attiva audio meteo'"
    :style="settings.weatherAudio
      ? 'background: var(--z-green-700); color: var(--z-green-100)'
      : 'background: var(--z-bg-700); color: var(--z-text-md)'"
    @click="settings.toggleWeatherAudio()"
  >
    <UIcon
      :name="settings.weatherAudio ? 'i-lucide-volume-2' : 'i-lucide-volume-x'"
      class="size-4"
    />
  </button>
</template>
