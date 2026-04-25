<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { AREAS as LEGACY_AREAS, ADJACENCY as LEGACY_ADJACENCY, type Area, type AreaId } from '~~/shared/map/areas'
import type { GeneratedMap } from '~~/shared/map/generators/types'
import { usePartyStore } from '~/stores/party'
import { useViewStore } from '~/stores/view'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'
import MapArea from '~/components/map/MapArea.vue'
import MapAvatar from '~/components/map/MapAvatar.vue'
import MapWeatherOverlay from '~/components/map/MapWeatherOverlay.vue'
import { useAreaWeather } from '~/composables/useAreaWeather'
import MapLegend from '~/components/map/MapLegend.vue'
import MapPlayersBox from '~/components/map/MapPlayersBox.vue'
import MapRoads from '~/components/map/MapRoads.vue'
import MapDecor from '~/components/map/MapDecor.vue'
import MapTransitionDoors from '~/components/map/MapTransitionDoors.vue'

// T20: GameMap consuma un GeneratedMap deterministico quando passato
// (path multi-mappa post-T20). In assenza, usa la mappa hardcoded legacy
// in `shared/map/areas.ts` per non rompere call-site pre-T20 (es. test
// e party legacy senza partyMaps).
interface TransitionOutgoing {
  id: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
}

const props = defineProps<{
  generatedMap?: GeneratedMap | null
  // v2d T28: transitions outgoing dalla mappa attiva. Quando il player clicca
  // un'area target di una transition, send move:request con toMapId+toAreaId.
  transitions?: TransitionOutgoing[]
}>()

const areas = computed<readonly Area[]>(() => {
  if (props.generatedMap) {
    return props.generatedMap.areas.map<Area>(a => ({
      id: a.id as AreaId,
      name: a.name,
      svg: {
        x: a.shape.x,
        y: a.shape.y,
        w: a.shape.w,
        h: a.shape.h,
        shape: a.shape.kind,
        points: a.shape.points
      }
    }))
  }
  return LEGACY_AREAS
})

const adjacency = computed<Record<string, string[]>>(() => {
  if (props.generatedMap) return props.generatedMap.adjacency
  return LEGACY_ADJACENCY as Record<string, string[]>
})

const adjacencyPairs = computed<Array<[string, string]>>(() => {
  const pairs: Array<[string, string]> = []
  const seen = new Set<string>()
  for (const a of Object.keys(adjacency.value)) {
    for (const b of adjacency.value[a] ?? []) {
      const key = a < b ? `${a}::${b}` : `${b}::${a}`
      if (seen.has(key)) continue
      seen.add(key)
      pairs.push([a, b])
    }
  }
  return pairs
})

const validAreaIds = computed(() => new Set(areas.value.map(a => a.id)))
function isValidAreaId(id: string): boolean {
  return validAreaIds.value.has(id as AreaId)
}

const seed = usePartySeed()
const party = usePartyStore(seed)
const partyStore = party
const viewStore = useViewStore(seed)
const connection = usePartyConnections().open(seed)

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
    resizeObs?.disconnect()
    resizeObs = null
  })
}

// ViewBox dinamico che matcha le dimensioni del contenitore: così il bg
// gradient riempie sempre l'intera zona (niente letterbox visibile) e il
// contenuto logico (1000x700) viene messo dentro in meet preservando aspetto
// e leggibilità del testo.
const LOGICAL_W = 1000
const LOGICAL_H = 700
const containerEl = ref<HTMLElement | null>(null)
const containerW = ref<number>(LOGICAL_W)
const containerH = ref<number>(LOGICAL_H)
const viewBox = computed(() => `0 0 ${containerW.value} ${containerH.value}`)
const contentScale = computed(() =>
  Math.min(containerW.value / LOGICAL_W, containerH.value / LOGICAL_H)
)
const contentTransform = computed(() => {
  const s = contentScale.value
  const tx = (containerW.value - LOGICAL_W * s) / 2
  const ty = (containerH.value - LOGICAL_H * s) / 2
  return `translate(${tx}, ${ty}) scale(${s})`
})

// ── Zoom & pan ───────────────────────────────────────────────────────────────
// Transform applicato sopra a contentTransform: viewBox coords → viewBox coords.
// zoom in [1, 4], pan in pixel del container (stessa scala del viewBox).
const MIN_ZOOM = 1
const MAX_ZOOM = 4
const zoom = ref(1)
const panX = ref(0)
const panY = ref(0)
const userTransform = computed(() =>
  `translate(${panX.value} ${panY.value}) scale(${zoom.value})`
)
const isZoomed = computed(() => zoom.value > 1.001 || panX.value !== 0 || panY.value !== 0)

function clampZoom(z: number): number {
  return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, z))
}

function resetView() {
  zoom.value = 1
  panX.value = 0
  panY.value = 0
}

// Ricentra sulla zona corrente del player con zoom 2×
function centerOnMe() {
  const myAreaId = party.me?.currentAreaId
  if (!myAreaId) return
  const area = areas.value.find(a => a.id === myAreaId)
  if (!area) return
  // Centro dell'area in coord logiche 1000x700
  const logicalCx = area.svg.x + area.svg.w / 2
  const logicalCy = area.svg.y + area.svg.h / 2
  // Centro in viewBox dopo contentTransform (scaling + centering)
  const s = contentScale.value
  const tx = (containerW.value - LOGICAL_W * s) / 2
  const ty = (containerH.value - LOGICAL_H * s) / 2
  const vx = logicalCx * s + tx
  const vy = logicalCy * s + ty
  const targetZoom = 2
  zoom.value = targetZoom
  // Vogliamo che (vx, vy) appaia al centro del viewport: cx=containerW/2
  // con transform translate(panX panY) scale(zoom): point (vx,vy) →
  // (zoom*vx + panX, zoom*vy + panY). Set = (containerW/2, containerH/2).
  panX.value = containerW.value / 2 - targetZoom * vx
  panY.value = containerH.value / 2 - targetZoom * vy
}

function zoomAt(cx: number, cy: number, factor: number) {
  const newZoom = clampZoom(zoom.value * factor)
  if (newZoom === zoom.value) return
  const k = newZoom / zoom.value
  panX.value = cx * (1 - k) + panX.value * k
  panY.value = cy * (1 - k) + panY.value * k
  zoom.value = newZoom
}

function onWheel(e: WheelEvent) {
  if (!containerEl.value) return
  const rect = containerEl.value.getBoundingClientRect()
  const cx = e.clientX - rect.left
  const cy = e.clientY - rect.top
  const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
  zoomAt(cx, cy, factor)
}

// Pan con drag (mouse): iniziato sul bg, si propaga come pan solo se il
// pointer si sposta oltre soglia — altrimenti è un click su area che
// arriva normalmente all'handler MapArea.
const panStart = ref<{ x: number, y: number } | null>(null)
const isPanning = ref(false)
const PAN_THRESHOLD_PX = 5

function onPointerDown(e: PointerEvent) {
  if (e.button !== 0) return
  panStart.value = { x: e.clientX, y: e.clientY }
  isPanning.value = false
}

function onPointerMove(e: PointerEvent) {
  if (!panStart.value) return
  const dx = e.clientX - panStart.value.x
  const dy = e.clientY - panStart.value.y
  if (!isPanning.value && Math.hypot(dx, dy) > PAN_THRESHOLD_PX) {
    isPanning.value = true
    ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
  }
  if (isPanning.value) {
    panX.value += e.movementX
    panY.value += e.movementY
  }
}

function onPointerUp(e: PointerEvent) {
  if (isPanning.value) {
    // Sopprimi il click che sta per arrivare come effetto collaterale del drag
    const cancel = (ev: Event) => ev.stopPropagation()
    window.addEventListener('click', cancel, { capture: true, once: true })
    // Se per qualche motivo non arriva, rimuovi l'hook dopo un tick
    setTimeout(() => window.removeEventListener('click', cancel, { capture: true }), 50)
    ;(e.target as Element | null)?.releasePointerCapture?.(e.pointerId)
  }
  panStart.value = null
  isPanning.value = false
}

// Pinch zoom (touch): 2 dita → distanza tra le due determina lo zoom
const pinchState = ref<{ distance: number, cx: number, cy: number } | null>(null)

function pointerDistance(a: Touch, b: Touch): number {
  return Math.hypot(b.clientX - a.clientX, b.clientY - a.clientY)
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length !== 2 || !containerEl.value) return
  const [a, b] = [e.touches[0]!, e.touches[1]!]
  const rect = containerEl.value.getBoundingClientRect()
  pinchState.value = {
    distance: pointerDistance(a, b),
    cx: (a.clientX + b.clientX) / 2 - rect.left,
    cy: (a.clientY + b.clientY) / 2 - rect.top
  }
  // Annulla eventuale pan mono-dito in corso
  panStart.value = null
  isPanning.value = false
}

function onTouchMove(e: TouchEvent) {
  if (!pinchState.value || e.touches.length !== 2) return
  e.preventDefault()
  const [a, b] = [e.touches[0]!, e.touches[1]!]
  const dist = pointerDistance(a, b)
  const factor = dist / pinchState.value.distance
  zoomAt(pinchState.value.cx, pinchState.value.cy, factor)
  pinchState.value.distance = dist
}

function onTouchEnd() {
  pinchState.value = null
}
let resizeObs: ResizeObserver | null = null
onMounted(() => {
  if (typeof window === 'undefined' || !containerEl.value) return
  const rect = containerEl.value.getBoundingClientRect()
  containerW.value = rect.width || LOGICAL_W
  containerH.value = rect.height || LOGICAL_H
  resizeObs = new ResizeObserver((entries) => {
    for (const e of entries) {
      containerW.value = e.contentRect.width
      containerH.value = e.contentRect.height
    }
  })
  resizeObs.observe(containerEl.value)
})

// Per generated map gli id sono stringhe arbitrarie; manteniamo AreaId come
// alias di string per compatibilità con i call-site legacy (useAreaWeather,
// onAreaClick) che ancora tipizzano AreaId.
const currentAreaId = computed<AreaId | null>(() => (party.me?.currentAreaId as AreaId) ?? null)

const adjacentSet = computed(() => {
  if (!currentAreaId.value) return new Set<string>()
  return new Set<string>(adjacency.value[currentAreaId.value] ?? [])
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

// Layout pallini dentro l'area: stessa aritmetica di MapAvatar (griglia
// paddingX=14 paddingY=30, cell=18, start top-left). Calcoliamo qui quanti
// pallini stanno dentro ai confini; se il totale eccede, tagliamo l'ultima
// cella utile per far posto al pill "+N".
const AVATAR_CELL = 18
const AVATAR_PAD_X = 14
const AVATAR_PAD_Y = 30
const AVATAR_MAX_COLS = 4
const AVATAR_BOTTOM_PAD = 14
const AVATAR_RIGHT_PAD = 14

function avatarCapacity(areaW: number, areaH: number): { cols: number, rows: number, max: number } {
  const availW = areaW - AVATAR_PAD_X - AVATAR_RIGHT_PAD
  const availH = areaH - AVATAR_PAD_Y - AVATAR_BOTTOM_PAD
  const cols = Math.max(1, Math.min(AVATAR_MAX_COLS, Math.floor(availW / AVATAR_CELL)))
  const rows = Math.max(1, Math.floor(availH / AVATAR_CELL))
  return { cols, rows, max: cols * rows }
}

function visiblePlayersFor(area: Area): { visible: typeof party.players, hidden: number, overflowPos: { x: number, y: number } | null } {
  const all = playersByArea.value.get(area.id) ?? []
  const { cols, max } = avatarCapacity(area.svg.w, area.svg.h)
  if (all.length <= max) {
    return { visible: all, hidden: 0, overflowPos: null }
  }
  // Riserva l'ultima cella per il pill "+N"
  const visible = all.slice(0, max - 1)
  const hidden = all.length - visible.length
  const lastIdx = max - 1
  const col = lastIdx % cols
  const row = Math.floor(lastIdx / cols)
  return {
    visible,
    hidden,
    overflowPos: {
      x: area.svg.x + AVATAR_PAD_X + col * AVATAR_CELL,
      y: area.svg.y + AVATAR_PAD_Y + row * AVATAR_CELL
    }
  }
}

const { weather } = useAreaWeather(() => currentAreaId.value as AreaId | null)

function onAreaClick(areaId: AreaId) {
  if (!partyStore.me) return
  const myArea = partyStore.me.currentAreaId as AreaId
  if (!isValidAreaId(myArea) || !isValidAreaId(areaId)) return
  // Già qui: il click apre il dettaglio dell'area
  if (myArea === areaId) {
    viewStore.openArea(areaId)
    return
  }
  const isMasterRole = partyStore.me.role === 'master'
  // Master può muoversi ovunque; user solo in area adiacente e non chiusa
  if (!isMasterRole) {
    const adj = new Set<string>(adjacency.value[myArea] ?? [])
    if (!adj.has(areaId)) return // non raggiungibile, no-op
    const targetState = stateById.value.get(areaId)
    if (targetState?.status === 'closed') return
  }
  connection.send({ type: 'move:request', toAreaId: areaId })
}

// v2d T28+UX: per ogni transition outgoing, click sulla strada-porta dedicata
// (renderizzata in MapTransitionDoors) invia il move cross-map. La strada esce
// dall'area edge verso il bordo del viewport per essere visivamente distinta
// dalle adiacenze intra-mappa.
function onTransitionClick(toMapId: string, toAreaId: string) {
  if (!partyStore.me) return
  connection.send({ type: 'move:request', toAreaId, toMapId })
}
</script>

<template>
  <section
    ref="containerEl"
    class="w-full relative flex-1 min-h-0"
    style="background: var(--z-bg-900)"
  >
    <svg
      :viewBox="viewBox"
      preserveAspectRatio="none"
      style="width: 100%; height: 100%; display: block; touch-action: none"
      :style="isPanning ? 'cursor: grabbing' : ''"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointerleave="onPointerUp"
      @touchstart.passive="onTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
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
      <!-- Bg + grain riempiono l'intero viewBox dinamico: no più letterbox -->
      <rect
        :width="containerW"
        :height="containerH"
        fill="url(#map-bg)"
      />
      <rect
        :width="containerW"
        :height="containerH"
        filter="url(#map-grain)"
        opacity="0.3"
      />

      <!-- User zoom/pan applicato sopra al fit-to-container -->
      <g :transform="userTransform">
        <!-- Contenuto logico 1000x700 scalato uniformemente e centrato -->
        <g :transform="contentTransform">
          <MapDecor :areas="areas" />
          <MapRoads
            :areas="areas"
            :pairs="adjacencyPairs"
          />
          <MapTransitionDoors
            :areas="areas"
            :transitions="props.transitions ?? []"
            :logical-w="LOGICAL_W"
            :logical-h="LOGICAL_H"
            @transition-click="onTransitionClick"
          />

          <MapArea
            v-for="a in areas"
            :key="a.id"
            :area="a"
            :state="stateById.get(a.id) ?? null"
            :is-current="currentAreaId === a.id"
            :is-adjacent="adjacentSet.has(a.id)"
            :is-master="isMaster"
            :player-count="(playersByArea.get(a.id)?.length ?? 0)"
            @click="onAreaClick(a.id as AreaId)"
          />

          <template
            v-for="a in areas"
            :key="`av-${a.id}`"
          >
            <MapAvatar
              v-for="(p, i) in visiblePlayersFor(a).visible"
              :key="p.id"
              :player="p"
              :area="a"
              :index="i"
              :is-self="party.me?.id === p.id"
              @click="(ev) => onAvatarClick(ev, p)"
            />
            <!-- Pill "+N" quando ci sono più player di quanti ne stiano -->
            <g
              v-if="visiblePlayersFor(a).hidden > 0 && visiblePlayersFor(a).overflowPos"
              :transform="`translate(${visiblePlayersFor(a).overflowPos!.x}, ${visiblePlayersFor(a).overflowPos!.y})`"
              style="pointer-events: none"
            >
              <title>Altri {{ visiblePlayersFor(a).hidden }} nella zona</title>
              <circle
                r="8"
                fill="var(--z-bg-700)"
                stroke="var(--z-green-300)"
                stroke-width="1.2"
              />
              <text
                text-anchor="middle"
                y="3"
                font-size="9"
                font-weight="700"
                fill="var(--z-green-300)"
              >+{{ visiblePlayersFor(a).hidden }}</text>
            </g>
          </template>

          <MapWeatherOverlay :weather="weather" />
        </g>
      </g>
    </svg>
    <MapLegend />
    <MapPlayersBox />

    <!-- Controlli zoom & pan manuali -->
    <div
      class="absolute bottom-3 right-3 flex flex-col gap-1 rounded-md p-1 z-10"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <button
        type="button"
        class="flex items-center justify-center size-8 rounded"
        style="background: var(--z-bg-700); color: var(--z-text-md)"
        title="Ingrandisci (rotella o pinch)"
        @click="zoomAt(containerW / 2, containerH / 2, 1.3)"
      >
        <UIcon
          name="i-lucide-zoom-in"
          class="size-4"
        />
      </button>
      <div
        class="flex items-center justify-center h-5 text-xs font-mono-z"
        style="color: var(--z-text-md)"
        :title="`Zoom corrente: ${Math.round(zoom * 100)}%`"
      >
        {{ Math.round(zoom * 100) }}%
      </div>
      <button
        type="button"
        class="flex items-center justify-center size-8 rounded"
        style="background: var(--z-bg-700); color: var(--z-text-md)"
        title="Rimpicciolisci"
        @click="zoomAt(containerW / 2, containerH / 2, 1 / 1.3)"
      >
        <UIcon
          name="i-lucide-zoom-out"
          class="size-4"
        />
      </button>
      <button
        type="button"
        class="flex items-center justify-center size-8 rounded"
        style="background: var(--z-bg-700); color: var(--z-text-md)"
        title="Centra sulla mia zona"
        :disabled="!party.me"
        @click="centerOnMe"
      >
        <UIcon
          name="i-lucide-locate-fixed"
          class="size-4"
        />
      </button>
      <button
        type="button"
        class="flex items-center justify-center size-8 rounded"
        :style="isZoomed
          ? 'background: var(--z-rust-700); color: var(--z-rust-300)'
          : 'background: var(--z-bg-700); color: var(--z-text-lo)'"
        title="Reset zoom e pan"
        :disabled="!isZoomed"
        @click="resetView"
      >
        <UIcon
          name="i-lucide-maximize"
          class="size-4"
        />
      </button>
    </div>
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
