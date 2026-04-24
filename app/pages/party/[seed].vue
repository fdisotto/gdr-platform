<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { useSession } from '~/composables/useSession'
import { usePartyStore } from '~/stores/party'
import { useChatStore } from '~/stores/chat'
import { useViewStore } from '~/stores/view'
import { useZombiesStore } from '~/stores/zombies'
import { usePlayerPositionsStore } from '~/stores/player-positions'
import { usePartyConnection } from '~/composables/usePartyConnection'
import PartyHeader from '~/components/layout/PartyHeader.vue'
import ConnectionBanner from '~/components/layout/ConnectionBanner.vue'
import PartyChat from '~/components/chat/PartyChat.vue'
import GameMap from '~/components/map/GameMap.vue'
import AreaDetailView from '~/components/map/AreaDetailView.vue'
import DirectMessagesView from '~/components/dm/DirectMessagesView.vue'

const route = useRoute()
const seed = String(route.params.seed)
const session = useSession()
const partyStore = usePartyStore()
const chatStore = useChatStore()
const viewStore = useViewStore()
const zombiesStore = useZombiesStore()
const playerPositionsStore = usePlayerPositionsStore()
const connection = usePartyConnection()

const guardError = ref<string | null>(null)

onMounted(async () => {
  const local = session.getSession(seed)
  if (!local) {
    guardError.value = 'Nessuna sessione locale per questa party. Torna alla home.'
    return
  }
  try {
    await $fetch(`/api/parties/${seed}/resume`, {
      method: 'POST',
      body: { sessionToken: local.sessionToken }
    })
  } catch {
    guardError.value = 'Sessione non valida: torna alla home e unisciti di nuovo.'
    session.removeSession(seed)
    return
  }
  connection.connect({ seed, sessionToken: local.sessionToken })
})

useSeoMeta({ title: () => partyStore.party?.cityName ?? 'GDR Zombi' })

onBeforeRouteLeave(() => {
  connection.disconnect()
  partyStore.reset()
  chatStore.reset()
  viewStore.reset()
  zombiesStore.reset()
  playerPositionsStore.reset()
  return true
})
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <template v-if="guardError">
      <main class="flex-1 flex items-center justify-center p-8 text-center overflow-auto">
        <div class="space-y-4">
          <p
            class="text-sm"
            style="color: var(--z-blood-300)"
          >
            {{ guardError }}
          </p>
          <NuxtLink
            to="/"
            class="text-sm underline"
            style="color: var(--z-green-300)"
          >
            Torna alla home
          </NuxtLink>
        </div>
      </main>
    </template>
    <template v-else>
      <PartyHeader />
      <ConnectionBanner />
      <div class="flex-1 flex flex-col overflow-hidden min-h-0">
        <GameMap v-if="viewStore.mainView === 'map'" />
        <AreaDetailView v-else-if="viewStore.mainView === 'area'" />
        <DirectMessagesView v-else-if="viewStore.mainView === 'dm'" />
        <PartyChat />
      </div>
    </template>
  </div>
</template>
