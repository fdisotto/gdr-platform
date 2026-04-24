<script setup lang="ts">
import { computed } from 'vue'
import type { AreaId } from '~~/shared/map/areas'
import { useAreaWeather } from '~/composables/useAreaWeather'
import { usePartyStore } from '~/stores/party'

const party = usePartyStore()

const areaIdRef = () => (party.me?.currentAreaId as AreaId | undefined) ?? null

const { weather } = useAreaWeather(areaIdRef)

const icon = computed(() => {
  switch (weather.value?.code) {
    case 'clear': return 'i-lucide-sun'
    case 'overcast': return 'i-lucide-cloud'
    case 'fog': return 'i-lucide-cloud-fog'
    case 'rain': return 'i-lucide-cloud-rain'
    case 'storm': return 'i-lucide-cloud-lightning'
    case 'ashfall': return 'i-lucide-wind'
    case 'redSky': return 'i-lucide-sunset'
    case 'night': return 'i-lucide-moon'
    default: return 'i-lucide-cloud'
  }
})
</script>

<template>
  <div
    v-if="weather"
    class="flex items-center gap-1 text-xs"
    style="color: var(--z-text-md)"
  >
    <UIcon
      :name="icon"
      class="size-4"
    />
    <span>{{ weather.label }}</span>
  </div>
</template>
