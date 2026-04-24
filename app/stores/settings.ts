import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'gdr.settings'

interface StoredSettings {
  colorNicknames: boolean
  // 0..1; 0 = muto. Retro-compat: vecchio bool weatherAudio mappato a 0.7/0.
  weatherVolume: number
}

function readStored(): StoredSettings {
  const fallback: StoredSettings = { colorNicknames: true, weatherVolume: 0 }
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings & { weatherAudio?: boolean }>
    let weatherVolume = parsed.weatherVolume
    if (typeof weatherVolume !== 'number') {
      weatherVolume = parsed.weatherAudio ? 0.7 : 0
    }
    weatherVolume = Math.min(1, Math.max(0, weatherVolume))
    return {
      colorNicknames: parsed.colorNicknames ?? true,
      weatherVolume
    }
  } catch {
    return fallback
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = readStored()
  const colorNicknames = ref(initial.colorNicknames)
  const weatherVolume = ref(initial.weatherVolume)

  function persist() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      colorNicknames: colorNicknames.value,
      weatherVolume: weatherVolume.value
    }))
  }
  watch(colorNicknames, persist)
  watch(weatherVolume, persist)

  function toggleColorNicknames() {
    colorNicknames.value = !colorNicknames.value
  }
  function setWeatherVolume(v: number) {
    weatherVolume.value = Math.min(1, Math.max(0, v))
  }
  function muteWeather() {
    weatherVolume.value = 0
  }
  function unmuteWeather(target = 0.7) {
    weatherVolume.value = target
  }

  // Computed retro-compat per i consumer che vogliono solo "audio on"
  const weatherAudio = computed(() => weatherVolume.value > 0)

  return {
    colorNicknames, weatherVolume, weatherAudio,
    toggleColorNicknames, setWeatherVolume, muteWeather, unmuteWeather
  }
})
