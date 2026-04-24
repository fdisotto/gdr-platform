import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { AreaId } from '~~/shared/map/areas'

export type MainView = 'map' | 'dm' | 'area'

export const useViewStore = defineStore('view', () => {
  const mainView = ref<MainView>('map')
  const selectedThreadKey = ref<string | null>(null)
  const viewedAreaId = ref<AreaId | null>(null)

  function show(v: MainView) {
    mainView.value = v
  }

  function openThread(key: string) {
    selectedThreadKey.value = key
    mainView.value = 'dm'
  }

  function openArea(areaId: AreaId) {
    viewedAreaId.value = areaId
    mainView.value = 'area'
  }

  function backToMap() {
    mainView.value = 'map'
  }

  function reset() {
    mainView.value = 'map'
    selectedThreadKey.value = null
    viewedAreaId.value = null
  }

  return { mainView, selectedThreadKey, viewedAreaId, show, openThread, openArea, backToMap, reset }
})
