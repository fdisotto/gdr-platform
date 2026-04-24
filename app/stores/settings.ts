import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

const STORAGE_KEY = 'gdr.settings'

interface StoredSettings {
  colorNicknames: boolean
}

function readStored(): StoredSettings {
  if (typeof localStorage === 'undefined') return { colorNicknames: true }
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return { colorNicknames: true }
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings>
    return { colorNicknames: parsed.colorNicknames ?? true }
  } catch {
    return { colorNicknames: true }
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = readStored()
  const colorNicknames = ref(initial.colorNicknames)

  watch(colorNicknames, (v) => {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ colorNicknames: v }))
  })

  function toggleColorNicknames() {
    colorNicknames.value = !colorNicknames.value
  }

  return { colorNicknames, toggleColorNicknames }
})
