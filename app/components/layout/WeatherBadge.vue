<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import type { AreaId } from '~~/shared/map/areas'
import { AREA_IDS } from '~~/shared/map/areas'
import { useAreaWeather } from '~/composables/useAreaWeather'
import { usePartyStore } from '~/stores/party'
import { usePartyConnection } from '~/composables/usePartyConnection'
import { usePartySeed } from '~/composables/usePartySeed'

const seed = usePartySeed()
const party = usePartyStore(seed)
const connection = usePartyConnection()

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

const isMaster = computed(() => party.me?.role === 'master')

// Master weather tool
type WeatherCode = 'clear' | 'overcast' | 'fog' | 'rain' | 'storm' | 'ashfall' | 'redSky' | 'night'
const WEATHER_OPTIONS: { value: WeatherCode, label: string, icon: string }[] = [
  { value: 'clear', label: 'Sereno', icon: 'i-lucide-sun' },
  { value: 'overcast', label: 'Nuvoloso', icon: 'i-lucide-cloud' },
  { value: 'fog', label: 'Nebbia', icon: 'i-lucide-cloud-fog' },
  { value: 'rain', label: 'Pioggia', icon: 'i-lucide-cloud-rain' },
  { value: 'storm', label: 'Tempesta', icon: 'i-lucide-cloud-lightning' },
  { value: 'ashfall', label: 'Cenere', icon: 'i-lucide-wind' },
  { value: 'redSky', label: 'Cielo rosso', icon: 'i-lucide-sunset' },
  { value: 'night', label: 'Notte', icon: 'i-lucide-moon' }
]

const open = ref(false)
const wrapper = ref<HTMLElement | null>(null)

const targetArea = ref<string>('*')
const code = ref<WeatherCode>('rain')
const intensity = ref<number>(0.7)

function toggleOpen() {
  if (!isMaster.value) return
  if (!open.value && weather.value) {
    // Preselect with current area weather when opening
    targetArea.value = party.me?.currentAreaId ?? '*'
    const c = weather.value.code
    if ((WEATHER_OPTIONS as readonly { value: string }[]).some(o => o.value === c)) {
      code.value = c as WeatherCode
    }
    intensity.value = weather.value.intensity ?? 0.7
  }
  open.value = !open.value
}
function close() {
  open.value = false
}

function apply() {
  connection.send({
    type: 'master:weather-override',
    areaId: targetArea.value === '*' ? null : targetArea.value,
    code: code.value,
    intensity: intensity.value
  })
  close()
}
function clear() {
  connection.send({
    type: 'master:weather-override',
    areaId: targetArea.value === '*' ? null : targetArea.value,
    clear: true
  })
  close()
}

function onDocClick(e: MouseEvent) {
  if (!open.value || !wrapper.value) return
  if (wrapper.value.contains(e.target as Node)) return
  close()
}
function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

if (typeof window !== 'undefined') {
  document.addEventListener('mousedown', onDocClick)
  window.addEventListener('keydown', onKey)
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocClick)
    window.removeEventListener('keydown', onKey)
  })
}
</script>

<template>
  <div
    v-if="weather"
    ref="wrapper"
    class="relative"
  >
    <button
      type="button"
      class="flex items-center gap-1 text-xs px-2 py-1 rounded"
      :title="isMaster ? 'Modifica meteo' : weather.label"
      :style="isMaster
        ? 'background: var(--z-bg-700); color: var(--z-text-md); cursor: pointer'
        : 'color: var(--z-text-md); cursor: default'"
      :disabled="!isMaster"
      @click="toggleOpen"
    >
      <UIcon
        :name="icon"
        class="size-4"
      />
      <span>{{ weather.label }}</span>
      <UIcon
        v-if="isMaster"
        name="i-lucide-chevron-down"
        class="size-3 ml-0.5"
        style="color: var(--z-text-lo)"
      />
    </button>

    <div
      v-if="open && isMaster"
      class="absolute right-0 top-full mt-1 z-20 rounded-md p-3 w-72 space-y-3"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border)"
      @click.stop
    >
      <div class="space-y-1">
        <label
          class="block text-xs uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Area bersaglio
        </label>
        <select
          v-model="targetArea"
          class="w-full bg-transparent border rounded px-2 py-1 text-sm"
          style="border-color: var(--z-border); color: var(--z-text-hi)"
        >
          <option value="*">
            * globale (tutte le aree)
          </option>
          <option
            v-for="a in AREA_IDS"
            :key="a"
            :value="a"
          >
            {{ a }}
          </option>
        </select>
      </div>

      <div class="space-y-1">
        <label
          class="block text-xs uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Condizione
        </label>
        <div class="grid grid-cols-4 gap-1">
          <button
            v-for="o in WEATHER_OPTIONS"
            :key="o.value"
            type="button"
            class="flex flex-col items-center gap-0.5 px-1 py-1.5 rounded text-xs"
            :title="o.label"
            :style="code === o.value
              ? 'background: var(--z-green-700); color: var(--z-green-100)'
              : 'background: var(--z-bg-800); color: var(--z-text-md)'"
            @click="code = o.value"
          >
            <UIcon
              :name="o.icon"
              class="size-4"
            />
            <span
              class="text-[10px] leading-tight truncate w-full text-center"
            >{{ o.label }}</span>
          </button>
        </div>
      </div>

      <div class="space-y-1">
        <label
          class="flex items-center justify-between text-xs uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          <span>Intensità</span>
          <span
            class="font-mono-z"
            style="color: var(--z-text-hi)"
          >{{ Math.round(intensity * 100) }}%</span>
        </label>
        <input
          v-model.number="intensity"
          type="range"
          min="0"
          max="1"
          step="0.05"
          class="w-full accent-green-600"
        >
      </div>

      <div class="flex items-center justify-end gap-2 pt-1">
        <UButton
          type="button"
          size="xs"
          variant="ghost"
          color="neutral"
          @click="clear"
        >
          Rimuovi override
        </UButton>
        <UButton
          type="button"
          size="xs"
          color="primary"
          @click="apply"
        >
          Applica
        </UButton>
      </div>
    </div>
  </div>
</template>
