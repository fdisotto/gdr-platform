import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'gdr.settings'

interface StoredSettings {
  colorNicknames: boolean
  weatherAudio: boolean
}

function readStored(): StoredSettings {
  if (typeof localStorage === 'undefined') return { colorNicknames: true, weatherAudio: false }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { colorNicknames: true, weatherAudio: false }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return {
      colorNicknames: parsed.colorNicknames ?? true,
      weatherAudio: parsed.weatherAudio ?? false
    }
  } catch {
    return { colorNicknames: true, weatherAudio: false }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = readStored()
  const colorNicknames = ref(initial.colorNicknames)
  const weatherAudio = ref(initial.weatherAudio)

  function persist() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      colorNicknames: colorNicknames.value,
      weatherAudio: weatherAudio.value
    }))
  }
  watch(colorNicknames, persist)
  watch(weatherAudio, persist)

  function toggleColorNicknames() {
    colorNicknames.value = !colorNicknames.value
  }
  function toggleWeatherAudio() {
    weatherAudio.value = !weatherAudio.value
  }

  return { colorNicknames, weatherAudio, toggleColorNicknames, toggleWeatherAudio }
})
