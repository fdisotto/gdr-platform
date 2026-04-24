<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue'
import { AREAS, ADJACENCY, type AreaId } from '~~/shared/map/areas'
import { usePartyStore } from '~/stores/party'
import { useZombiesStore } from '~/stores/zombies'
import { useViewStore } from '~/stores/view'
import { usePlayerPositionsStore } from '~/stores/player-positions'
import { usePartyConnection } from '~/composables/usePartyConnection'
import { useAreaWeather } from '~/composables/useAreaWeather'
import MapWeatherOverlay from '~/components/map/MapWeatherOverlay.vue'
import type { Zombie } from '~~/shared/protocol/ws'

const party = usePartyStore()
const zombies = useZombiesStore()
const viewStore = useViewStore()
const playerPositionsStore = usePlayerPositionsStore()
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
  // Il master non appare come pedina nel detail (non è un personaggio)
  return party.players.filter(p =>
    p.currentAreaId === area.value!.id && p.role !== 'master'
  )
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

// ── Tool modes ──────────────────────────────────────────────────────────────
type Tool = 'paint' | 'select' | 'move' | 'erase' | 'area-rect' | 'area-lasso'
const tool = ref<Tool>('paint')

const cursorForTool = computed(() => {
  if (!isMaster.value) return 'cursor: default'
  switch (tool.value) {
    case 'paint': return 'cursor: crosshair'
    case 'select': return 'cursor: cell'
    case 'move': return 'cursor: move'
    case 'erase': return 'cursor: not-allowed'
    case 'area-rect': return 'cursor: cell'
    case 'area-lasso': return 'cursor: crosshair'
    default: return 'cursor: default'
  }
})

// ── Paint state ──────────────────────────────────────────────────────────────
const isPainting = ref(false)
const lastSpawnAt = ref(0)
const SPAWN_THROTTLE_MS = 50
const paintBatch = ref<Array<{ x: number, y: number }>>([])
let paintFlushTimer: ReturnType<typeof setTimeout> | null = null

// ── Erase state ──────────────────────────────────────────────────────────────
const isErasing = ref(false)

// ── Move state ───────────────────────────────────────────────────────────────
const draggingZombieId = ref<string | null>(null)
const dragOffsets = ref<Map<string, { dx: number, dy: number }>>(new Map())

// ── Rubber band select ───────────────────────────────────────────────────────
const rubberStart = ref<{ x: number, y: number } | null>(null)
const rubberCurrent = ref<{ x: number, y: number } | null>(null)

const rubberRect = computed(() => {
  if (!rubberStart.value || !rubberCurrent.value) return null
  const x1 = Math.min(rubberStart.value.x, rubberCurrent.value.x)
  const y1 = Math.min(rubberStart.value.y, rubberCurrent.value.y)
  const x2 = Math.max(rubberStart.value.x, rubberCurrent.value.x)
  const y2 = Math.max(rubberStart.value.y, rubberCurrent.value.y)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
})

// ── Area rect drag ───────────────────────────────────────────────────────────
const rectStart = ref<{ x: number, y: number } | null>(null)
const rectCurrent = ref<{ x: number, y: number } | null>(null)

const rectShape = computed(() => {
  if (!rectStart.value || !rectCurrent.value) return null
  const x1 = Math.min(rectStart.value.x, rectCurrent.value.x)
  const y1 = Math.min(rectStart.value.y, rectCurrent.value.y)
  const x2 = Math.max(rectStart.value.x, rectCurrent.value.x)
  const y2 = Math.max(rectStart.value.y, rectCurrent.value.y)
  return { x: x1, y: y1, w: x2 - x1, h: y2 - y1 }
})

// ── Lasso path ───────────────────────────────────────────────────────────────
const lassoPoints = ref<Array<{ x: number, y: number }>>([])

const lassoSvgPath = computed(() => {
  if (lassoPoints.value.length === 0) return ''
  const head = lassoPoints.value[0]!
  let d = `M ${head.x} ${head.y}`
  for (let i = 1; i < lassoPoints.value.length; i++) {
    d += ` L ${lassoPoints.value[i]!.x} ${lassoPoints.value[i]!.y}`
  }
  return d + ' Z'
})

// ── Helpers ──────────────────────────────────────────────────────────────────
function svgPoint(e: MouseEvent): { x: number, y: number } | null {
  const svg = document.querySelector('#area-detail-svg') as SVGSVGElement | null
  if (!svg) return null
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svg.getScreenCTM()?.inverse()
  if (!ctm) return null
  const loc = pt.matrixTransform(ctm)
  return { x: loc.x, y: loc.y }
}

function flushPaintBatch() {
  if (!area.value || paintBatch.value.length === 0) return
  const positions = paintBatch.value
  paintBatch.value = []
  if (positions.length === 1) {
    connection.send({
      type: 'master:spawn-zombie',
      areaId: area.value.id,
      x: positions[0]!.x,
      y: positions[0]!.y
    })
  } else {
    connection.send({
      type: 'master:spawn-zombies',
      areaId: area.value.id,
      positions
    })
  }
}

function schedulePaintFlush() {
  if (paintFlushTimer) return
  paintFlushTimer = setTimeout(() => {
    paintFlushTimer = null
    flushPaintBatch()
  }, 200)
}

function eraseAt(pt: { x: number, y: number }) {
  const radius = 14
  const toRemove = zombiesInArea.value.filter((z) => {
    const dx = z.x - pt.x
    const dy = z.y - pt.y
    return dx * dx + dy * dy < radius * radius
  })
  for (const z of toRemove) {
    connection.send({ type: 'master:remove-zombie', id: z.id })
  }
}

function moveDragTo(pt: { x: number, y: number }) {
  for (const [id, off] of dragOffsets.value) {
    zombies.move(id, pt.x + off.dx, pt.y + off.dy)
  }
}

// ── Area spawn helpers ───────────────────────────────────────────────────────
const SPAWN_GRID_STEP = 28
const SPAWN_MAX = 200

function gridPositionsInRect(r: { x: number, y: number, w: number, h: number }): Array<{ x: number, y: number }> {
  const out: Array<{ x: number, y: number }> = []
  for (let y = r.y + SPAWN_GRID_STEP / 2; y < r.y + r.h; y += SPAWN_GRID_STEP) {
    for (let x = r.x + SPAWN_GRID_STEP / 2; x < r.x + r.w; x += SPAWN_GRID_STEP) {
      out.push({ x, y })
      if (out.length >= SPAWN_MAX) return out
    }
  }
  return out
}

function pointInPolygon(pt: { x: number, y: number }, polygon: Array<{ x: number, y: number }>): boolean {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i]!.x
    const yi = polygon[i]!.y
    const xj = polygon[j]!.x
    const yj = polygon[j]!.y
    const intersect = (yi > pt.y) !== (yj > pt.y)
      && pt.x < ((xj - xi) * (pt.y - yi)) / (yj - yi + 0.000001) + xi
    if (intersect) inside = !inside
  }
  return inside
}

function gridPositionsInPolygon(polygon: Array<{ x: number, y: number }>): Array<{ x: number, y: number }> {
  if (polygon.length < 3) return []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const p of polygon) {
    if (p.x < minX) minX = p.x
    if (p.x > maxX) maxX = p.x
    if (p.y < minY) minY = p.y
    if (p.y > maxY) maxY = p.y
  }
  const out: Array<{ x: number, y: number }> = []
  for (let y = minY + SPAWN_GRID_STEP / 2; y < maxY; y += SPAWN_GRID_STEP) {
    for (let x = minX + SPAWN_GRID_STEP / 2; x < maxX; x += SPAWN_GRID_STEP) {
      const candidate = { x, y }
      if (pointInPolygon(candidate, polygon)) {
        out.push(candidate)
        if (out.length >= SPAWN_MAX) return out
      }
    }
  }
  return out
}

function spawnPositionsBatch(positions: Array<{ x: number, y: number }>) {
  if (!area.value || positions.length === 0) return
  if (positions.length === 1) {
    connection.send({
      type: 'master:spawn-zombie',
      areaId: area.value.id,
      x: positions[0]!.x,
      y: positions[0]!.y
    })
  } else {
    connection.send({
      type: 'master:spawn-zombies',
      areaId: area.value.id,
      positions
    })
  }
}

// ── SVG event handlers ───────────────────────────────────────────────────────
function onSvgMouseDown(e: MouseEvent) {
  if (!isMaster.value || !area.value) return
  const pt = svgPoint(e)
  if (!pt) return
  if (tool.value === 'paint') {
    isPainting.value = true
    paintBatch.value.push(pt)
    lastSpawnAt.value = performance.now()
    schedulePaintFlush()
    return
  }
  if (tool.value === 'erase') {
    isErasing.value = true
    eraseAt(pt)
    return
  }
  if (tool.value === 'select') {
    rubberStart.value = pt
    rubberCurrent.value = pt
    return
  }
  if (tool.value === 'area-rect') {
    rectStart.value = pt
    rectCurrent.value = pt
    return
  }
  if (tool.value === 'area-lasso') {
    lassoPoints.value = [pt]
    return
  }
  // move: gestito da onZombieMouseDown
}

function onSvgMouseMove(e: MouseEvent) {
  if (!area.value) return
  const pt = svgPoint(e)
  if (!pt) return
  if (isPainting.value && tool.value === 'paint') {
    const now = performance.now()
    if (now - lastSpawnAt.value >= SPAWN_THROTTLE_MS) {
      paintBatch.value.push(pt)
      lastSpawnAt.value = now
      schedulePaintFlush()
    }
    return
  }
  if (isErasing.value && tool.value === 'erase') {
    eraseAt(pt)
    return
  }
  if (rubberStart.value && tool.value === 'select') {
    rubberCurrent.value = pt
    return
  }
  if (rectStart.value && tool.value === 'area-rect') {
    rectCurrent.value = pt
    return
  }
  if (tool.value === 'area-lasso' && lassoPoints.value.length > 0) {
    const last = lassoPoints.value[lassoPoints.value.length - 1]!
    const dx = pt.x - last.x
    const dy = pt.y - last.y
    if (dx * dx + dy * dy > 16) {
      lassoPoints.value.push(pt)
    }
    return
  }
  if (draggingZombieId.value && tool.value === 'move') {
    moveDragTo(pt)
    return
  }
}

function onSvgMouseUp() {
  if (isPainting.value) {
    isPainting.value = false
    if (paintFlushTimer) {
      clearTimeout(paintFlushTimer)
      paintFlushTimer = null
    }
    flushPaintBatch()
  }
  if (isErasing.value) {
    isErasing.value = false
  }
  if (rubberStart.value && rubberRect.value) {
    const rect = rubberRect.value
    // Solo seleziona se il rect ha una dimensione minima (evita click accidentali)
    if (rect.w > 4 || rect.h > 4) {
      const ids = zombiesInArea.value
        .filter(z => z.x >= rect.x && z.x <= rect.x + rect.w && z.y >= rect.y && z.y <= rect.y + rect.h)
        .map(z => z.id)
      if (ids.length > 0) zombies.setSelection(ids)
      else zombies.clearSelection()
    }
  }
  rubberStart.value = null
  rubberCurrent.value = null
  if (rectStart.value && tool.value === 'area-rect') {
    if (rectShape.value && rectShape.value.w > 8 && rectShape.value.h > 8) {
      const positions = gridPositionsInRect(rectShape.value)
      spawnPositionsBatch(positions)
    }
    rectStart.value = null
    rectCurrent.value = null
  }
  if (tool.value === 'area-lasso' && lassoPoints.value.length > 0) {
    const positions = gridPositionsInPolygon(lassoPoints.value)
    spawnPositionsBatch(positions)
    lassoPoints.value = []
  }
  if (draggingZombieId.value) {
    // Commit move per ogni zombie nel gruppo drag
    for (const id of dragOffsets.value.keys()) {
      const z = zombiesInArea.value.find(zz => zz.id === id)
      if (z) {
        connection.send({ type: 'master:move-zombie', id: z.id, x: z.x, y: z.y })
      }
    }
    draggingZombieId.value = null
    dragOffsets.value.clear()
  }
}

function onZombieMouseDown(e: MouseEvent, z: Zombie) {
  if (!isMaster.value) return
  e.stopPropagation()
  if (tool.value === 'erase') {
    connection.send({ type: 'master:remove-zombie', id: z.id })
    return
  }
  if (tool.value === 'select') {
    if (e.shiftKey) zombies.toggle(z.id)
    else zombies.setSelection([z.id])
    return
  }
  if (tool.value === 'move') {
    draggingZombieId.value = z.id
    const startPt = svgPoint(e)
    if (!startPt) return
    // Se lo zombie cliccato è selezionato, drag tutti i selezionati. Altrimenti solo lui.
    const groupIds = zombies.selected.has(z.id) ? Array.from(zombies.selected) : [z.id]
    const offsets = new Map<string, { dx: number, dy: number }>()
    for (const id of groupIds) {
      const target = zombiesInArea.value.find(zz => zz.id === id)
      if (target) offsets.set(id, { dx: target.x - startPt.x, dy: target.y - startPt.y })
    }
    dragOffsets.value = offsets
    return
  }
  // paint mode: click su zombie non fa nulla di speciale
}

// ── Keyboard shortcuts ───────────────────────────────────────────────────────
function onKeyDown(e: KeyboardEvent) {
  if (!isMaster.value) return
  if (e.key === 'Backspace' || e.key === 'Delete') {
    if (zombies.selected.size === 0) return
    const ids = Array.from(zombies.selected)
    for (const id of ids) {
      connection.send({ type: 'master:remove-zombie', id })
    }
  }
  if (e.key === 'Escape') {
    zombies.clearSelection()
    rectStart.value = null
    rectCurrent.value = null
    lassoPoints.value = []
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
})
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (paintFlushTimer) clearTimeout(paintFlushTimer)
})

// ── Player drag (master può spostare pedine) ─────────────────────────────────
const dragging = ref<string | null>(null)

function startDrag(e: MouseEvent, playerId: string) {
  if (!isMaster.value) return
  e.stopPropagation()
  dragging.value = playerId
  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', endDrag)
}

function onDrag(e: MouseEvent) {
  if (!dragging.value || !area.value) return
  const svg = document.querySelector('#area-detail-svg') as SVGSVGElement | null
  if (!svg) return
  const pt = svg.createSVGPoint()
  pt.x = e.clientX
  pt.y = e.clientY
  const ctm = svg.getScreenCTM()?.inverse()
  if (!ctm) return
  const loc = pt.matrixTransform(ctm)
  playerPositionsStore.set(dragging.value, area.value.id, loc.x, loc.y)
}

function endDrag() {
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', endDrag)
  if (!dragging.value || !area.value) {
    dragging.value = null
    return
  }
  const pos = playerPositionsStore.get(dragging.value, area.value.id)
  if (pos) {
    connection.send({
      type: 'master:place-player',
      playerId: dragging.value,
      areaId: area.value.id,
      x: pos.x,
      y: pos.y
    })
  }
  dragging.value = null
}

const DEFAULT_CENTER_X = VIEWBOX_W / 2
const DEFAULT_CENTER_Y = VIEWBOX_H * 0.55

function defaultPlayerPos(index: number, total: number): { x: number, y: number } {
  if (total === 1) {
    return { x: DEFAULT_CENTER_X, y: DEFAULT_CENTER_Y }
  }
  const radius = Math.min(120, 40 + total * 12)
  const startAngle = -Math.PI / 2
  const a = startAngle + (index / total) * Math.PI * 2
  return {
    x: DEFAULT_CENTER_X + Math.cos(a) * radius,
    y: DEFAULT_CENTER_Y + Math.sin(a) * radius
  }
}

function playerMarkerPos(player: { id: string }, index: number, total: number): { x: number, y: number } {
  if (!area.value) return { x: 0, y: 0 }
  const stored = playerPositionsStore.get(player.id, area.value.id)
  if (stored) return stored
  return defaultPlayerPos(index, total)
}
</script>

<template>
  <section
    v-if="area"
    class="w-full relative flex-1 min-h-0 flex flex-col"
    style="background: var(--z-bg-900)"
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

    <!-- Toolbar tool modes (solo master) -->
    <div
      v-if="isMaster"
      class="absolute top-16 left-3 flex flex-col gap-1 p-2 rounded-md z-10"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <button
        v-for="t in (['paint', 'area-rect', 'area-lasso', 'select', 'move', 'erase'] as const)"
        :key="t"
        type="button"
        class="text-xs px-2 py-1 rounded text-left flex items-center gap-2"
        :title="t"
        :style="tool === t
          ? 'background: var(--z-green-700); color: var(--z-green-100)'
          : 'background: var(--z-bg-700); color: var(--z-text-md)'"
        @click="tool = t"
      >
        <span>{{ ({ 'paint': '🧟', 'area-rect': '▭', 'area-lasso': '✏', 'select': '☐', 'move': '✥', 'erase': '⌫' })[t] }}</span>
        <span class="capitalize">{{ ({ 'paint': 'spawn', 'area-rect': 'orda □', 'area-lasso': 'orda libera', 'select': 'sel.', 'move': 'sposta', 'erase': 'rimuovi' })[t] }}</span>
      </button>
      <div
        v-if="zombies.selected.size > 0"
        class="text-xs mt-2 px-2 py-1 rounded"
        style="background: var(--z-bg-700); color: var(--z-text-md)"
      >
        {{ zombies.selected.size }} sel · DEL
      </div>
    </div>

    <svg
      id="area-detail-svg"
      :viewBox="`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`"
      preserveAspectRatio="xMidYMid meet"
      style="width: 100%; flex: 1; display: block; min-height: 0"
      :style="cursorForTool"
      @mousedown="onSvgMouseDown"
      @mousemove="onSvgMouseMove"
      @mouseup="onSvgMouseUp"
      @mouseleave="onSvgMouseUp"
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
        @mousedown="onZombieMouseDown($event, z)"
      >
        <title>{{ isMaster ? `zombie ${z.id.slice(0, 6)} — ${tool}` : 'zombie' }}</title>
        <circle
          v-if="zombies.isSelected(z.id)"
          r="14"
          fill="none"
          stroke="var(--z-green-300)"
          stroke-width="2"
          stroke-dasharray="3 3"
        />
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
          pointer-events="none"
        >🧟</text>
      </g>

      <!-- Rubber band selection -->
      <rect
        v-if="rubberRect"
        :x="rubberRect.x"
        :y="rubberRect.y"
        :width="rubberRect.w"
        :height="rubberRect.h"
        fill="var(--z-green-300)"
        fill-opacity="0.1"
        stroke="var(--z-green-300)"
        stroke-width="1"
        stroke-dasharray="4 3"
        pointer-events="none"
      />

      <!-- Area rect preview -->
      <g
        v-if="rectShape && tool === 'area-rect'"
        pointer-events="none"
      >
        <rect
          :x="rectShape.x"
          :y="rectShape.y"
          :width="rectShape.w"
          :height="rectShape.h"
          fill="var(--z-rust-500)"
          fill-opacity="0.1"
          stroke="var(--z-rust-300)"
          stroke-width="1.5"
          stroke-dasharray="6 4"
        />
        <text
          :x="rectShape.x + rectShape.w / 2"
          :y="rectShape.y + rectShape.h / 2"
          text-anchor="middle"
          font-size="14"
          fill="var(--z-rust-300)"
          font-weight="700"
        >
          🧟 × {{ Math.min(SPAWN_MAX, Math.floor(rectShape.w / SPAWN_GRID_STEP) * Math.floor(rectShape.h / SPAWN_GRID_STEP)) }}
        </text>
      </g>

      <!-- Lasso preview -->
      <g
        v-if="tool === 'area-lasso' && lassoPoints.length > 0"
        pointer-events="none"
      >
        <path
          :d="lassoSvgPath"
          fill="var(--z-rust-500)"
          fill-opacity="0.08"
          stroke="var(--z-rust-300)"
          stroke-width="1.5"
          stroke-dasharray="4 4"
        />
      </g>

      <!-- Player nella zona -->
      <g
        v-for="(p, i) in playersInArea"
        :key="p.id"
        :transform="`translate(${playerMarkerPos(p, i, playersInArea.length).x}, ${playerMarkerPos(p, i, playersInArea.length).y})`"
        :style="isMaster ? 'cursor: grab' : undefined"
        @mousedown="startDrag($event, p.id)"
      >
        <title>{{ p.nickname }}{{ isMaster ? ' — trascina per muovere' : '' }}</title>
        <circle
          r="12"
          :fill="p.role === 'master' ? 'var(--z-blood-500)' : 'var(--z-green-300)'"
          stroke="var(--z-bg-900)"
          stroke-width="2"
        />
        <text
          text-anchor="middle"
          :y="-18"
          font-size="11"
          :fill="p.role === 'master' ? 'var(--z-blood-300)' : 'var(--z-green-100)'"
          style="pointer-events: none; user-select: none"
        >{{ p.nickname }}</text>
      </g>
    </svg>
  </section>
  <section
    v-else
    class="w-full flex items-center justify-center flex-1 min-h-0"
    style="background: var(--z-bg-900)"
  >
    <p
      class="text-sm italic"
      style="color: var(--z-text-lo)"
    >
      Nessuna zona selezionata.
    </p>
  </section>
</template>
