import { ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { makeKeyed } from '~/stores/factory'
import type { AreaId } from '~~/shared/map/areas'

export type MainView = 'map' | 'world' | 'dm' | 'area' | 'master'

const CHAT_COLLAPSED_KEY = 'gdr.chatCollapsed'

function readChatCollapsed(): boolean {
  if (typeof localStorage === 'undefined') return false
  return localStorage.getItem(CHAT_COLLAPSED_KEY) === '1'
}

function viewStoreFactoryForSeed(seed: string) {
  // mainView e' tenuto come ref ma riflette anche la sub-route attiva:
  // ogni pagina figlia (party/[seed]/world.vue ecc.) chiama show('xxx')
  // in onMounted; viceversa, le funzioni open* qui fanno router.push
  // verso la sub-route corrispondente, cosi un reload preserva la view.
  const mainView = ref<MainView>('map')
  const selectedThreadKey = ref<string | null>(null)
  const viewedAreaId = ref<AreaId | null>(null)
  const chatCollapsed = ref<boolean>(readChatCollapsed())
  const unreadWhileCollapsed = ref<number>(0)

  // useRouter() e' disponibile in qualunque setup-context (incluso un
  // factory pinia setup-store). Manca solo in SSR senza request, che
  // non e' il nostro caso (le pagine party sono sempre client-rendered
  // a partire da hydrate). In modalita test non c'e' Vue Router → usa
  // un fallback che non fa nulla.
  let router: ReturnType<typeof useRouter> | null = null
  try {
    router = useRouter()
  } catch {
    router = null
  }

  function go(path: string) {
    if (router) void router.push(path)
  }

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
    go(`/party/${seed}/dm`)
  }

  function openArea(areaId: AreaId) {
    viewedAreaId.value = areaId
    mainView.value = 'area'
    go(`/party/${seed}/area`)
  }

  function openMaster() {
    mainView.value = 'master'
    go(`/party/${seed}/master`)
  }

  function backToMap() {
    mainView.value = 'map'
    go(`/party/${seed}`)
  }

  function openWorld() {
    mainView.value = 'world'
    go(`/party/${seed}/world`)
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

// makeKeyed passa il seed al factory: il viewStore ne ha bisogno per
// costruire i path di navigazione (router.push usa /party/<seed>/...).
export const useViewStore = makeKeyed('view', viewStoreFactoryForSeed)
