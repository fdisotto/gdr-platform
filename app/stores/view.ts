import { defineStore } from 'pinia'
import { ref } from 'vue'

export type MainView = 'map' | 'dm'

export const useViewStore = defineStore('view', () => {
  const mainView = ref<MainView>('map')
  const selectedThreadKey = ref<string | null>(null)

  function show(v: MainView) {
    mainView.value = v
  }

  function openThread(key: string) {
    selectedThreadKey.value = key
    mainView.value = 'dm'
  }

  function reset() {
    mainView.value = 'map'
    selectedThreadKey.value = null
  }

  return { mainView, selectedThreadKey, show, openThread, reset }
})
