<script setup lang="ts">
import { ref, shallowRef, watch } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { usePartyStore } from '~/stores/party'
import { useChatStore } from '~/stores/chat'
import { useViewStore } from '~/stores/view'
import { useZombiesStore } from '~/stores/zombies'
import { usePlayerPositionsStore } from '~/stores/player-positions'
import { useWeatherOverridesStore } from '~/stores/weather-overrides'
import { useMasterToolsStore } from '~/stores/master-tools'
import { useFeedbackStore } from '~/stores/feedback'
import { useAuthStore } from '~/stores/auth'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import PartyHeader from '~/components/layout/PartyHeader.vue'
import ConnectionBanner from '~/components/layout/ConnectionBanner.vue'
import PartyChat from '~/components/chat/PartyChat.vue'
import MapView from '~/components/map/MapView.vue'
import WorldMapView from '~/components/map/WorldMapView.vue'
import AreaDetailView from '~/components/map/AreaDetailView.vue'
import DirectMessagesView from '~/components/dm/DirectMessagesView.vue'
import MasterPanel from '~/components/master/MasterPanel.vue'

const route = useRoute()
const seed = String(route.params.seed)
const partyStore = usePartyStore(seed)
const chatStore = useChatStore(seed)
const viewStore = useViewStore(seed)
const zombiesStore = useZombiesStore(seed)
const playerPositionsStore = usePlayerPositionsStore(seed)
const weatherOverridesStore = useWeatherOverridesStore(seed)
const masterToolsStore = useMasterToolsStore(seed)
const feedbackStore = useFeedbackStore()
const authStore = useAuthStore()
const conns = usePartyConnections()
// shallowRef così possiamo riassegnare la connection dopo un re-open
// (post 4003 not_member) e mantenere reattività sui template che leggono
// `connection.value.notMember.value`.
const connection = shallowRef(conns.open(seed))
const feedback = useErrorFeedback()

useSeoMeta({ title: () => partyStore.party?.cityName ?? 'GDR Zombi' })

// Join form (mostrato se il ws si chiude 4003 not_member)
const joinDisplayName = ref('')
const joining = ref(false)

// Quando notMember diventa true dopo il close 4003, precompila il displayName
// con l'username così l'utente di solito conferma e basta.
watch(
  () => connection.value.notMember.value,
  (nm) => {
    if (nm && !joinDisplayName.value && authStore.identity?.username) {
      joinDisplayName.value = authStore.identity.username
    }
  }
)

async function doJoin() {
  if (joining.value) return
  joining.value = true
  try {
    await $fetch(`/api/parties/${seed}/join`, {
      method: 'POST',
      body: { displayName: joinDisplayName.value }
    })
    feedbackStore.pushToast({ level: 'info', title: 'Ti sei unito alla party' })
    // Dopo close 4003 la connection è in stato 'closed' con closedFlag=true;
    // bisogna prima rimuoverla dalla mappa per poter riaprirne una pulita.
    conns.close(seed)
    connection.value = conns.open(seed)
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    joining.value = false
  }
}

onBeforeRouteLeave(() => {
  conns.close(seed)
  partyStore.reset()
  chatStore.reset()
  viewStore.reset()
  zombiesStore.reset()
  playerPositionsStore.reset()
  weatherOverridesStore.reset()
  masterToolsStore.reset()
  feedbackStore.reset()
  return true
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Form "unisciti a questa party" (only se il server ha risposto not_member) -->
    <main
      v-if="connection.notMember.value"
      class="flex-1 flex items-center justify-center p-8"
    >
      <div class="w-full max-w-sm space-y-6">
        <header class="text-center space-y-2">
          <h1
            class="text-2xl font-bold"
            style="color: var(--z-green-300)"
          >
            Unisciti alla party
          </h1>
          <p
            class="text-sm"
            style="color: var(--z-text-md)"
          >
            Non sei ancora membro di questa party. Scegli un display name
            per entrare.
          </p>
        </header>
        <form
          class="space-y-3 rounded p-4"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
          @submit.prevent="doJoin"
        >
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Display name</label>
            <input
              v-model="joinDisplayName"
              type="text"
              autofocus
              required
              minlength="2"
              maxlength="24"
              class="w-full px-3 py-2 rounded font-mono-z text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
            <p
              class="text-xs mt-1"
              style="color: var(--z-text-lo)"
            >
              2–24 caratteri; come ti vedranno gli altri in questa party.
            </p>
          </div>
          <UButton
            type="submit"
            block
            color="primary"
            :loading="joining"
          >
            Entra
          </UButton>
          <NuxtLink
            to="/"
            class="block text-xs text-center"
            style="color: var(--z-text-md); text-decoration: underline"
          >
            ← Annulla
          </NuxtLink>
        </form>
      </div>
    </main>
    <template v-else>
      <PartyHeader />
      <ConnectionBanner />
      <div class="flex-1 flex flex-col overflow-hidden min-h-0">
        <MapView v-if="viewStore.mainView === 'map'" />
        <WorldMapView v-else-if="viewStore.mainView === 'world'" />
        <AreaDetailView v-else-if="viewStore.mainView === 'area'" />
        <DirectMessagesView v-else-if="viewStore.mainView === 'dm'" />
        <MasterPanel v-else-if="viewStore.mainView === 'master'" />
        <PartyChat />
      </div>
    </template>
  </div>
</template>
