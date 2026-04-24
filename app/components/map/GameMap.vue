<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import { AREAS, ADJACENCY, type AreaId } from '~~/shared/map/areas'
import { usePartyStore } from '~/stores/party'
import { useViewStore } from '~/stores/view'
import { usePartyConnection } from '~/composables/usePartyConnection'
import MapArea from '~/components/map/MapArea.vue'
import MapAvatar from '~/components/map/MapAvatar.vue'
import MapWeatherOverlay from '~/components/map/MapWeatherOverlay.vue'
import { useAreaWeather } from '~/composables/useAreaWeather'
import MapLegend from '~/components/map/MapLegend.vue'
import MapRoads from '~/components/map/MapRoads.vue'
import MapDecor from '~/components/map/MapDecor.vue'

const party = usePartyStore()
const partyStore = party
const viewStore = useViewStore()
const connection = usePartyConnection()

// Master player actions menu
interface PlayerSnapshot {
  id: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
}
const playerMenu = ref<{ playerId: string, nickname: string, role: string, isMuted: boolean, x: number, y: number } | null>(null)

function onAvatarClick(e: MouseEvent, p: PlayerSnapshot) {
  if (party.me?.role !== 'master' || p.id === party.me.id) return
  e.stopPropagation()
  playerMenu.value = {
    playerId: p.id,
    nickname: p.nickname,
    role: p.role,
    isMuted: false,
    x: e.clientX,
    y: e.clientY
  }
}

function closePlayerMenu() {
  playerMenu.value = null
}

function muteSelected(minutes: number | null) {
  if (!playerMenu.value) return
  connection.send({ type: 'master:mute', playerId: playerMenu.value.playerId, minutes })
  closePlayerMenu()
}
function unmuteSelected() {
  if (!playerMenu.value) return
  connection.send({ type: 'master:unmute', playerId: playerMenu.value.playerId })
  closePlayerMenu()
}
function kickSelected() {
  if (!playerMenu.value) return
  if (!confirm(`Espellere ${playerMenu.value.nickname}?`)) return
  connection.send({ type: 'master:kick', playerId: playerMenu.value.playerId, reason: null })
  closePlayerMenu()
}
function banSelected() {
  if (!playerMenu.value) return
  if (!confirm(`Bannare ${playerMenu.value.nickname}? Non potrà rientrare con questo nickname.`)) return
  connection.send({ type: 'master:ban', playerId: playerMenu.value.playerId, reason: null })
  closePlayerMenu()
}

function onDocMouseDown(_e: MouseEvent) {
  if (!playerMenu.value) return
  // Closing is handled here; menu itself uses @click.stop
  closePlayerMenu()
}
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', onDocMouseDown)
  onBeforeUnmount(() => {
    document.removeEventListener('mousedown', onDocMouseDown)
    closePlayerMenu()
  })
}

const currentAreaId = computed<AreaId | null>(() => (party.me?.currentAreaId as AreaId) ?? null)

const adjacentSet = computed(() => {
  if (!currentAreaId.value) return new Set<string>()
  return new Set<string>(ADJACENCY[currentAreaId.value] ?? [])
})

const isMaster = computed(() => party.me?.role === 'master')

const stateById = computed(() => {
  const map = new Map<string, { status: 'intact' | 'infested' | 'ruined' | 'closed', customName: string | null }>()
  for (const s of party.areasState) {
    map.set(s.areaId, { status: s.status, customName: s.customName })
  }
  return map
})

const playersByArea = computed(() => {
  const map = new Map<string, typeof party.players>()
  for (const p of party.players) {
    const list = map.get(p.currentAreaId) ?? []
    list.push(p)
    map.set(p.currentAreaId, list)
  }
  return map
})

const { weather } = useAreaWeather(() => currentAreaId.value as AreaId | null)

function onAreaClick(areaId: AreaId) {
  if (!partyStore.me) return
  const isMasterRole = partyStore.me.role === 'master'
  // Master: sempre apre detail (per gestire la zona)
  if (isMasterRole) {
    viewStore.openArea(areaId)
    return
  }
  // User: click utile solo se può effettivamente spostarsi.
  const myArea = partyStore.me.currentAreaId as AreaId
  if (myArea === areaId) return // già qui, niente da fare
  const adj = new Set<string>(ADJACENCY[myArea] ?? [])
  if (!adj.has(areaId)) return // non raggiungibile, no-op
  // Non chiusa (lo stato chiuso lo gestisce il server, qui evitiamo richieste inutili)
  const targetState = stateById.value.get(areaId)
  if (targetState?.status === 'closed') return
  connection.send({ type: 'move:request', toAreaId: areaId })
}
</script>

<template>
  <section
    class="w-full relative flex-1 min-h-0"
    style="background: var(--z-bg-900)"
  >
    <svg
      viewBox="0 0 1000 700"
      preserveAspectRatio="xMidYMid meet"
      style="width: 100%; height: 100%; display: block"
    >
      <defs>
        <radialGradient
          id="map-bg"
          cx="50%"
          cy="50%"
          r="75%"
        >
          <stop
            offset="0%"
            stop-color="#151a16"
          />
          <stop
            offset="100%"
            stop-color="#0b0d0c"
          />
        </radialGradient>
        <linearGradient
          id="area-bg"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="#1a1e1b"
          />
          <stop
            offset="100%"
            stop-color="#121513"
          />
        </linearGradient>
        <pattern
          id="area-infested"
          width="8"
          height="8"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="8"
            stroke="var(--z-green-500)"
            stroke-width="1.2"
          />
        </pattern>
        <pattern
          id="area-ruined"
          width="16"
          height="16"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 0 8 L 16 2 M 2 16 L 10 0 M 8 16 L 16 12"
            stroke="var(--z-text-lo)"
            stroke-width="0.8"
            fill="none"
          />
        </pattern>
        <filter id="map-grain">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.8"
            numOctaves="2"
            seed="3"
          />
          <feColorMatrix values="0 0 0 0 0.15 0 0 0 0 0.15 0 0 0 0 0.15 0 0 0 0.35 0" />
        </filter>
      </defs>
      <rect
        width="1000"
        height="700"
        fill="url(#map-bg)"
      />
      <rect
        width="1000"
        height="700"
        filter="url(#map-grain)"
        opacity="0.3"
      />

      <MapDecor />
      <MapRoads />

      <MapArea
        v-for="a in AREAS"
        :key="a.id"
        :area="a"
        :state="stateById.get(a.id) ?? null"
        :is-current="currentAreaId === a.id"
        :is-adjacent="adjacentSet.has(a.id)"
        :is-master="isMaster"
        :player-count="(playersByArea.get(a.id)?.length ?? 0)"
        @click="onAreaClick(a.id)"
      />

      <template
        v-for="a in AREAS"
        :key="`av-${a.id}`"
      >
        <MapAvatar
          v-for="(p, i) in (playersByArea.get(a.id) ?? [])"
          :key="p.id"
          :player="p"
          :area="a"
          :index="i"
          :is-self="party.me?.id === p.id"
          @click="(ev) => onAvatarClick(ev, p)"
        />
      </template>

      <MapWeatherOverlay :weather="weather" />
    </svg>
    <MapLegend />
    <div
      v-if="playerMenu"
      class="fixed z-40 rounded-md py-1"
      :style="`top: ${playerMenu.y + 6}px; left: ${playerMenu.x + 6}px; background: var(--z-bg-700); border: 1px solid var(--z-border); min-width: 180px`"
      @click.stop
    >
      <header
        class="px-3 py-1 text-xs uppercase"
        style="color: var(--z-text-md); border-bottom: 1px solid var(--z-border)"
      >
        {{ playerMenu.nickname }} · {{ playerMenu.role }}
      </header>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs"
        style="color: var(--z-text-hi)"
        @click="muteSelected(5)"
      >
        Muta 5 min
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs"
        style="color: var(--z-text-hi)"
        @click="muteSelected(60)"
      >
        Muta 1 ora
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs"
        style="color: var(--z-text-hi)"
        @click="muteSelected(null)"
      >
        Muta permanente
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs"
        style="color: var(--z-green-300)"
        @click="unmuteSelected"
      >
        Smuta
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs"
        style="color: var(--z-rust-300)"
        @click="kickSelected"
      >
        Kick
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs"
        style="color: var(--z-blood-300)"
        @click="banSelected"
      >
        Ban
      </button>
    </div>
  </section>
</template>
