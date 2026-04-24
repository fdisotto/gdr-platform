<script setup lang="ts">
import { computed } from 'vue'
import { AREAS, ADJACENCY, type AreaId } from '~~/shared/map/areas'
import { usePartyStore } from '~/stores/party'
import { useZombiesStore } from '~/stores/zombies'
import { useViewStore } from '~/stores/view'
import { usePartyConnection } from '~/composables/usePartyConnection'
import { useAreaWeather } from '~/composables/useAreaWeather'
import MapWeatherOverlay from '~/components/map/MapWeatherOverlay.vue'

const party = usePartyStore()
const zombies = useZombiesStore()
const viewStore = useViewStore()
const connection = usePartyConnection()

const VIEWBOX_W = 800
const VIEWBOX_H = 500

const area = computed(() => {
  const id = viewStore.viewedAreaId
  if (!id) return null
  return AREAS.find(a => a.id === id) ?? null
})

const state = computed(() => {
  if (!area.value) return null
  return party.areasState.find(s => s.areaId === area.value!.id) ?? null
})

const isMaster = computed(() => party.me?.role === 'master')

const canMoveHere = computed(() => {
  if (!area.value) return false
  if (isMaster.value) return true
  const myArea = party.me?.currentAreaId as AreaId | undefined
  if (!myArea) return false
  if (myArea === area.value.id) return false
  return (ADJACENCY[myArea] ?? []).includes(area.value.id)
})

const alreadyHere = computed(() => party.me?.currentAreaId === area.value?.id)

const playersInArea = computed(() => {
  if (!area.value) return []
  return party.players.filter(p => p.currentAreaId === area.value!.id)
})

const zombiesInArea = computed(() => {
  if (!area.value) return []
  return zombies.forArea(area.value.id)
})

const { weather } = useAreaWeather(() => area.value?.id as AreaId | null)

const displayName = computed(() => state.value?.customName ?? area.value?.name ?? '')
const status = computed(() => state.value?.status ?? 'intact')

const statusStyle = computed(() => ({
  intact: 'background: var(--z-green-700); color: var(--z-green-100)',
  infested: 'background: var(--z-rust-700); color: var(--z-rust-300)',
  ruined: 'background: var(--z-bg-700); color: var(--z-text-lo)',
  closed: 'background: var(--z-blood-700); color: var(--z-blood-300)'
}[status.value]))

function back() {
  viewStore.backToMap()
}

function moveHere() {
  if (!area.value) return
  connection.send({ type: 'move:request', toAreaId: area.value.id })
  viewStore.backToMap()
}

function onSvgClick(e: MouseEvent) {
  if (!isMaster.value || !area.value) return
  const svg = e.currentTarget as SVGSVGElement
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svg.getScreenCTM()?.inverse()
  if (!ctm) return
  const loc = pt.matrixTransform(ctm)
  connection.send({
    type: 'master:spawn-zombie',
    areaId: area.value.id,
    x: loc.x,
    y: loc.y
  })
}

function removeZombie(id: string) {
  if (!isMaster.value) return
  connection.send({ type: 'master:remove-zombie', id })
}

// Avatar position grid: semplice layout
function playerPos(i: number) {
  const col = i % 5
  const row = Math.floor(i / 5)
  return { x: 60 + col * 30, y: VIEWBOX_H - 80 + row * 30 }
}
</script>

<template>
  <section
    v-if="area"
    class="w-full relative"
    style="height: 55vh; background: var(--z-bg-900)"
  >
    <header
      class="absolute top-3 left-3 right-3 flex items-center justify-between gap-4 px-4 py-2 rounded-md z-10"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <div class="flex items-baseline gap-3 min-w-0">
        <UButton
          size="xs"
          color="neutral"
          variant="soft"
          icon="i-lucide-arrow-left"
          @click="back"
        >
          Mappa
        </UButton>
        <h2
          class="text-lg font-semibold truncate"
          style="color: var(--z-green-300)"
        >
          {{ displayName }}
        </h2>
        <span
          class="text-xs px-2 py-0.5 rounded font-mono-z"
          :style="statusStyle"
        >
          {{ status }}
        </span>
      </div>
      <div class="flex items-center gap-2">
        <span
          v-if="isMaster"
          class="text-xs"
          style="color: var(--z-text-md)"
        >Click sulla zona per spawnare uno zombie</span>
        <UButton
          v-if="canMoveHere && !alreadyHere"
          size="xs"
          color="primary"
          @click="moveHere"
        >
          Spostati qui
        </UButton>
        <span
          v-else-if="alreadyHere"
          class="text-xs"
          style="color: var(--z-green-300)"
        >Sei qui</span>
      </div>
    </header>

    <svg
      :viewBox="`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`"
      preserveAspectRatio="xMidYMid meet"
      style="width: 100%; height: 100%; display: block"
      :style="isMaster ? 'cursor: crosshair' : 'cursor: default'"
      @click="onSvgClick"
    >
      <defs>
        <radialGradient
          id="area-detail-bg"
          cx="50%"
          cy="50%"
          r="80%"
        >
          <stop
            offset="0%"
            stop-color="#1a2018"
          />
          <stop
            offset="100%"
            stop-color="#0b0d0c"
          />
        </radialGradient>
        <pattern
          id="area-detail-grid"
          width="40"
          height="40"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 40 0 L 0 0 0 40"
            fill="none"
            stroke="#1a1e1b"
            stroke-width="0.5"
          />
        </pattern>
      </defs>
      <rect
        :width="VIEWBOX_W"
        :height="VIEWBOX_H"
        fill="url(#area-detail-bg)"
      />
      <rect
        :width="VIEWBOX_W"
        :height="VIEWBOX_H"
        fill="url(#area-detail-grid)"
        pointer-events="none"
      />
      <!-- Weather overlay scalato in questo viewBox -->
      <g
        :transform="`scale(${VIEWBOX_W / 1000}, ${VIEWBOX_H / 700})`"
        pointer-events="none"
      >
        <MapWeatherOverlay :weather="weather" />
      </g>

      <!-- Zombies -->
      <g
        v-for="z in zombiesInArea"
        :key="z.id"
        :transform="`translate(${z.x}, ${z.y})`"
        :style="isMaster ? 'cursor: pointer' : undefined"
        @click.stop="removeZombie(z.id)"
      >
        <title>{{ isMaster ? 'click per rimuovere zombie' : 'zombie' }}</title>
        <circle
          r="10"
          fill="var(--z-green-700)"
          stroke="var(--z-blood-500)"
          stroke-width="1.5"
        />
        <text
          text-anchor="middle"
          y="4"
          font-size="12"
        >🧟</text>
      </g>

      <!-- Player nella zona -->
      <g
        v-for="(p, i) in playersInArea"
        :key="p.id"
        :transform="`translate(${playerPos(i).x}, ${playerPos(i).y})`"
        pointer-events="none"
      >
        <title>{{ p.nickname }}</title>
        <circle
          r="10"
          :fill="p.role === 'master' ? 'var(--z-blood-500)' : 'var(--z-green-300)'"
          stroke="var(--z-bg-900)"
          stroke-width="2"
        />
        <text
          text-anchor="middle"
          :y="-14"
          font-size="11"
          :fill="p.role === 'master' ? 'var(--z-blood-300)' : 'var(--z-green-100)'"
        >{{ p.nickname }}</text>
      </g>
    </svg>
  </section>
  <section
    v-else
    class="w-full flex items-center justify-center"
    style="height: 55vh; background: var(--z-bg-900)"
  >
    <p
      class="text-sm italic"
      style="color: var(--z-text-lo)"
    >
      Nessuna zona selezionata.
    </p>
  </section>
</template>
