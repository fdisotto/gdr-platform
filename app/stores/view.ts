import { ref, watch } from 'vue'
import { makeKeyed } from '~/stores/factory'
import type { AreaId } from '~~/shared/map/areas'

export type MainView = 'map' | 'world' | 'dm' | 'area' | 'master'

const CHAT_COLLAPSED_KEY = 'gdr.chatCollapsed'

function readChatCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(CHAT_COLLAPSED_KEY) === '1'
}

function viewStoreFactory() {
  const mainView = ref<MainView>('map')
  const selectedThreadKey = ref<string | null>(null)
  const viewedAreaId = ref<AreaId | null>(null)
  const chatCollapsed = ref<boolean>(readChatCollapsed())
  const unreadWhileCollapsed = ref<number>(0)

  watch(chatCollapsed, (v) => {
    if (typeof localStorage === 'undefined') return
    if (v) localStorage.setItem(CHAT_COLLAPSED_KEY, '1')
    else localStorage.removeItem(CHAT_COLLAPSED_KEY)
    if (!v) unreadWhileCollapsed.value = 0
  })

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

  function openMaster() {
    mainView.value = 'master'
  }

  function backToMap() {
    mainView.value = 'map'
  }

  function openWorld() {
    mainView.value = 'world'
  }

  function reset() {
    mainView.value = 'map'
    selectedThreadKey.value = null
    viewedAreaId.value = null
    unreadWhileCollapsed.value = 0
  }

  function toggleChatCollapsed() {
    chatCollapsed.value = !chatCollapsed.value
  }

  function bumpUnreadIfCollapsed() {
    if (chatCollapsed.value) unreadWhileCollapsed.value++
  }

  return {
    mainView, selectedThreadKey, viewedAreaId, chatCollapsed, unreadWhileCollapsed,
    show, openThread, openArea, openMaster, openWorld, backToMap, reset,
    toggleChatCollapsed, bumpUnreadIfCollapsed
  }
}

export const useViewStore = makeKeyed('view', viewStoreFactory)
