<script setup lang="ts">
import { computed, nextTick, ref, onMounted, onBeforeUnmount } from 'vue'
import { AREAS, ADJACENCY, type AreaId } from '~~/shared/map/areas'
import { usePartyStore } from '~/stores/party'
import { useZombiesStore } from '~/stores/zombies'
import { useViewStore } from '~/stores/view'
import { usePlayerPositionsStore } from '~/stores/player-positions'
import { useChatStore } from '~/stores/chat'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'
import { useAreaWeather } from '~/composables/useAreaWeather'
import { usePartyMaps } from '~/composables/usePartyMaps'
import { useGeneratedMap } from '~/composables/useGeneratedMap'
import MapWeatherOverlay from '~/components/map/MapWeatherOverlay.vue'
import type { Zombie } from '~~/shared/protocol/ws'
import type { GeneratedArea } from '~~/shared/map/generators/types'
import { applyAreaOverrides, buildEffectiveAdjacency } from '~~/shared/map/effective-map'

// v2d T22: detail view SVG canonical. La GeneratedArea viene risolta
// dalla mappa attiva del party (no prop esterna): seed + currentMapId
// → useGeneratedMap → applica areaOverrides → cerca per viewedAreaId.
// Fallback alle AREAS legacy MVP per party pre-multi-mappa.
const props = defineProps<{
  generatedArea?: GeneratedArea | null
}>()

const seed = usePartySeed()
const party = usePartyStore(seed)
const zombies = useZombiesStore(seed)
const viewStore = useViewStore(seed)
const playerPositionsStore = usePlayerPositionsStore(seed)
const chatStore = useChatStore(seed)
const connection = usePartyConnections().open(seed)
const { activeMap } = usePartyMaps(seed)

// Risolve la GeneratedArea per il viewedAreaId dalla mappa attiva del
// party. Self-contained: AreaDetailView non viene più montata con prop
// esterna `generatedArea`, ne deriva una qui da viewStore + activeMap.
const mapTypeId = computed<string | null>(() => activeMap.value?.mapTypeId ?? null)
const mapSeed = computed<string | null>(() => activeMap.value?.mapSeed ?? null)
const mapParams = computed<Record<string, unknown>>(() => activeMap.value?.params ?? {})
const baseGeneratedMap = useGeneratedMap(mapTypeId, mapSeed, mapParams)
const resolvedArea = computed<GeneratedArea | null>(() => {
  const id = viewStore.viewedAreaId
  if (!id) return null
  if (props.generatedArea && props.generatedArea.id === id) return props.generatedArea
  const base = baseGeneratedMap.value
  if (!base) return null
  const mapId = activeMap.value?.id ?? null
  const overrides = mapId
    ? party.areaOverrides.filter(o => o.mapId === mapId)
    : []
  const patched = applyAreaOverrides(base.areas, overrides)
  return patched.find(a => a.id === id) ?? null
})

// ViewBox dinamico: width fisso, height calcolata dal rapporto del
// contenitore reale. Così l'svg riempie tutto lo spazio disponibile senza
// distorcere zombi/avatar (preserveAspectRatio resta meet, niente stretch).
const VIEWBOX_W = 1600
const containerEl = ref<HTMLElement | null>(null)
const containerH = ref<number>(900)
const containerW = ref<number>(1600)
const VIEWBOX_H = computed(() => {
  if (containerW.value <= 0) return 900
  const ratio = containerH.value / containerW.value
  return Math.max(400, Math.round(VIEWBOX_W * ratio))
})

let resizeObs: ResizeObserver | null = null
onMounted(() => {
  if (typeof window === 'undefined') return
  if (containerEl.value) {
    const rect = containerEl.value.getBoundingClientRect()
    containerW.value = rect.width
    containerH.value = rect.height
    resizeObs = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerW.value = entry.contentRect.width
        containerH.value = entry.contentRect.height
      }
    })
    resizeObs.observe(containerEl.value)
  }
})
onBeforeUnmount(() => {
  resizeObs?.disconnect()
  resizeObs = null
})

const area = computed(() => {
  const id = viewStore.viewedAreaId
  if (!id) return null
  // v2d: usa la GeneratedArea risolta dalla mappa attiva (con override
  // applicati). Per party legacy (no multi-mappa) fallback su AREAS.
  const ga = resolvedArea.value
  if (ga) {
    return {
      id,
      name: ga.name,
      svg: {
        x: ga.shape.x,
        y: ga.shape.y,
        w: ga.shape.w,
        h: ga.shape.h,
        shape: ga.shape.kind
      }
    }
  }
  return AREAS.find(a => a.id === id) ?? null
})

const state = computed(() => {
  if (!area.value) return null
  return party.areasState.find(s => s.areaId === area.value!.id) ?? null
})

const isMaster = computed(() => party.me?.role === 'master')

// Adjacency effettiva (by-proximity post-drag + override) per la mappa
// attiva. Per party legacy (no multi-mappa) fallback su ADJACENCY MVP.
const effectiveAdjacency = computed<Record<string, string[]>>(() => {
  const base = baseGeneratedMap.value
  const mapId = activeMap.value?.id ?? null
  if (!base || !mapId) return ADJACENCY as Record<string, string[]>
  const areaOv = party.areaOverrides.filter(o => o.mapId === mapId)
  const adjOv = party.adjacencyOverrides.filter(o => o.mapId === mapId)
  const patched = applyAreaOverrides(base.areas, areaOv)
  return buildEffectiveAdjacency(patched, adjOv).visibleAdj
})

const canMoveHere = computed(() => {
  if (!area.value) return false
  if (isMaster.value) return true
  const myArea = party.me?.currentAreaId
  if (!myArea) return false
  if (myArea === area.value.id) return false
  return (effectiveAdjacency.value[myArea] ?? []).includes(area.value.id)
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
type Tool = 'paint' | 'npc' | 'select' | 'move' | 'erase' | 'area-rect' | 'area-lasso'
const tool = ref<Tool>('paint')

const cursorForTool = computed(() => {
  if (!isMaster.value) return 'cursor: default'
  switch (tool.value) {
    case 'paint': return 'cursor: crosshair'
    case 'npc': return 'cursor: crosshair'
    case 'select': return 'cursor: cell'
    case 'move': return 'cursor: move'
    case 'erase': return 'cursor: not-allowed'
    case 'area-rect': return 'cursor: cell'
    case 'area-lasso': return 'cursor: crosshair'
    default: return 'cursor: default'
  }
})

// ── NPC spawn modal ──────────────────────────────────────────────────────────
interface NpcDraft {
  x: number
  y: number
  name: string
  role: string
}
const npcDraft = ref<NpcDraft | null>(null)
const NPC_ROLE_PRESETS = [
  'poliziotto', 'medico', 'sopravvissuto', 'soldato', 'sciacallo',
  'prete', 'mercante', 'barista', 'meccanico', 'infetto'
]
const npcNameInputEl = ref<HTMLInputElement | null>(null)

function openNpcModal(pt: { x: number, y: number }) {
  npcDraft.value = { x: pt.x, y: pt.y, name: '', role: '' }
  void nextTick().then(() => npcNameInputEl.value?.focus())
}
function cancelNpc() {
  npcDraft.value = null
}
function confirmNpc() {
  if (!npcDraft.value || !area.value) return
  const name = npcDraft.value.name.trim()
  const role = npcDraft.value.role.trim()
  if (!name) return
  connection.send({
    type: 'master:spawn-zombie',
    areaId: area.value.id,
    x: npcDraft.value.x,
    y: npcDraft.value.y,
    npcName: name,
    npcRole: role || null
  })
  npcDraft.value = null
}

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
  // Clamp dentro il viewBox così zombie e marker non finiscono mai fuori
  // dalla zona disegnata anche se il mouse esce per qualche pixel.
  const margin = 8
  return {
    x: Math.max(margin, Math.min(VIEWBOX_W - margin, loc.x)),
    y: Math.max(margin, Math.min(VIEWBOX_H.value - margin, loc.y))
  }
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
  if (tool.value === 'npc') {
    openNpcModal(pt)
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
    if (npcDraft.value) npcDraft.value = null
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
const defaultCenterY = computed(() => VIEWBOX_H.value * 0.55)
const weatherScaleY = computed(() => VIEWBOX_H.value / 700)

function defaultPlayerPos(index: number, total: number): { x: number, y: number } {
  if (total === 1) {
    return { x: DEFAULT_CENTER_X, y: defaultCenterY.value }
  }
  const radius = Math.min(120, 40 + total * 12)
  const startAngle = -Math.PI / 2
  const a = startAngle + (index / total) * Math.PI * 2
  return {
    x: DEFAULT_CENTER_X + Math.cos(a) * radius,
    y: defaultCenterY.value + Math.sin(a) * radius
  }
}

function playerMarkerPos(player: { id: string }, index: number, total: number): { x: number, y: number } {
  if (!area.value) return { x: 0, y: 0 }
  const stored = playerPositionsStore.get(player.id, area.value.id)
  if (stored) return stored
  return defaultPlayerPos(index, total)
}

// ── Decor ambientale ────────────────────────────────────────────────────
// Sprite SVG semplici sparsi nella zona per riempire visivamente lo
// sfondo (edifici, alberi, auto, macerie, casse, lampioni, fuochi). La
// scelta dei tipi dipende dallo status; posizione e rotazione sono
// deterministiche su (areaId, status, viewBox) — niente shift a ogni
// render. Pointer-events: none per non interferire con i tool.
type DecorKind = 'tree' | 'building' | 'car' | 'rubble' | 'crate' | 'lamp' | 'fire'
interface Decor {
  id: string
  kind: DecorKind
  x: number
  y: number
  scale: number
  rot: number
}

function hashStr(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function rngFromHash(h: number): () => number {
  let a = h
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const decorPalette: Record<string, DecorKind[]> = {
  intact: ['tree', 'building', 'crate', 'lamp', 'tree'],
  infested: ['car', 'crate', 'fire', 'rubble', 'building'],
  ruined: ['rubble', 'rubble', 'car', 'building', 'crate'],
  closed: ['building', 'crate', 'lamp', 'building']
}

const decorElements = computed<Decor[]>(() => {
  if (!area.value) return []
  const id = area.value.id
  const st = status.value
  const W = VIEWBOX_W
  const H = VIEWBOX_H.value
  const seed = `${id}::${st}::${W}::${H}`
  const rng = rngFromHash(hashStr(seed))
  const palette = decorPalette[st] ?? decorPalette.intact!
  const N = 14
  const out: Decor[] = []
  // Safe zone centrale: i decor restano fuori da un raggio attorno al
  // centro così non si sovrappongono a zombi/player default.
  const cx = W / 2
  const cy = H / 2
  const safeR = Math.min(W, H) * 0.22
  for (let i = 0; i < N; i++) {
    let x = 0
    let y = 0
    let attempts = 0
    do {
      x = rng() * (W - 80) + 40
      y = rng() * (H - 80) + 40
      attempts++
    } while (Math.hypot(x - cx, y - cy) < safeR && attempts < 8)
    const kind = palette[Math.floor(rng() * palette.length)]!
    const scale = 0.75 + rng() * 0.65
    const rot = Math.floor(rng() * 360)
    out.push({ id: `dec-${i}`, kind, x, y, scale, rot })
  }
  return out
})
</script>

<template>
  <section
    v-if="area"
    ref="containerEl"
    class="w-full relative flex-1 min-h-0 flex flex-col select-none"
    style="background: var(--z-bg-900)"
  >
    <header
      class="absolute top-3 left-3 right-3 flex items-center justify-between gap-4 px-4 py-2 rounded-md z-10"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border); min-height: 40px"
    >
      <div class="flex items-center gap-3 min-w-0">
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
          class="text-lg font-semibold truncate leading-none"
          style="color: var(--z-green-300)"
        >
          {{ displayName }}
        </h2>
        <span
          class="text-xs px-2 py-0.5 rounded font-mono-z leading-none"
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
          class="text-xs leading-none"
          style="color: var(--z-green-300)"
        >Sei qui</span>
      </div>
    </header>

    <!-- Toolbar tool modes (solo master).
         Desktop: colonna verticale a sinistra sotto l'header.
         Mobile: scroll orizzontale in testa (sotto l'header) per non
         rubare spazio alla mappa. -->
    <div
      v-if="isMaster"
      class="absolute left-3 right-3 md:right-auto md:top-16 top-16 flex flex-row md:flex-col gap-1 p-2 rounded-md z-10 overflow-x-auto md:overflow-visible"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <button
        v-for="t in (['paint', 'npc', 'area-rect', 'area-lasso', 'select', 'move', 'erase'] as const)"
        :key="t"
        type="button"
        class="text-xs px-2 py-1 rounded text-left flex items-center gap-2 md:w-full shrink-0 whitespace-nowrap"
        :title="t"
        :style="tool === t
          ? 'background: var(--z-green-700); color: var(--z-green-100)'
          : 'background: var(--z-bg-700); color: var(--z-text-md)'"
        @click="tool = t"
      >
        <span
          class="inline-block text-center"
          style="width: 1.1rem; flex-shrink: 0"
        >{{ ({ 'paint': '🧟', 'npc': '👤', 'area-rect': '▭', 'area-lasso': '✏', 'select': '☐', 'move': '✥', 'erase': '⌫' })[t] }}</span>
        <span class="capitalize">{{ ({ 'paint': 'spawn', 'npc': 'npc', 'area-rect': 'orda □', 'area-lasso': 'orda libera', 'select': 'sel.', 'move': 'sposta', 'erase': 'rimuovi' })[t] }}</span>
      </button>
      <div
        v-if="zombies.selected.size > 0"
        class="text-xs md:mt-2 ml-1 md:ml-0 px-2 py-1 rounded shrink-0 whitespace-nowrap"
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
        :transform="`scale(${VIEWBOX_W / 1000}, ${weatherScaleY})`"
        pointer-events="none"
      >
        <MapWeatherOverlay :weather="weather" />
      </g>

      <!-- Decor ambientale (sotto i token interattivi) -->
      <g pointer-events="none">
        <g
          v-for="d in decorElements"
          :key="d.id"
          :transform="`translate(${d.x}, ${d.y}) rotate(${d.rot}) scale(${d.scale})`"
        >
          <!-- Tree: chioma + tronco -->
          <g v-if="d.kind === 'tree'">
            <circle
              r="16"
              fill="#1f2c1c"
              stroke="#13190f"
              stroke-width="1.5"
              opacity="0.9"
            />
            <circle
              r="11"
              fill="#2e4226"
              opacity="0.85"
            />
            <circle
              cx="-3"
              cy="-3"
              r="3"
              fill="#3d572f"
              opacity="0.9"
            />
          </g>
          <!-- Building: rect con finestre -->
          <g v-else-if="d.kind === 'building'">
            <rect
              x="-20"
              y="-26"
              width="40"
              height="52"
              fill="#23272a"
              stroke="#0f1112"
              stroke-width="1.5"
            />
            <rect
              x="-13"
              y="-19"
              width="6"
              height="6"
              fill="#3a3f3c"
            />
            <rect
              x="-3"
              y="-19"
              width="6"
              height="6"
              fill="#3a3f3c"
            />
            <rect
              x="7"
              y="-19"
              width="6"
              height="6"
              fill="#3a3f3c"
            />
            <rect
              x="-13"
              y="-7"
              width="6"
              height="6"
              fill="#3a3f3c"
            />
            <rect
              x="-3"
              y="-7"
              width="6"
              height="6"
              fill="#3a3f3c"
            />
            <rect
              x="7"
              y="-7"
              width="6"
              height="6"
              fill="#3a3f3c"
            />
            <rect
              x="-13"
              y="5"
              width="6"
              height="6"
              fill="#2a2e2b"
            />
            <rect
              x="7"
              y="5"
              width="6"
              height="6"
              fill="#2a2e2b"
            />
          </g>
          <!-- Car: chassis + tetto -->
          <g v-else-if="d.kind === 'car'">
            <rect
              x="-18"
              y="-8"
              width="36"
              height="16"
              rx="3"
              ry="3"
              fill="#2c211b"
              stroke="#0f0a07"
              stroke-width="1.2"
            />
            <rect
              x="-11"
              y="-6"
              width="22"
              height="7"
              fill="#4a342a"
            />
            <circle
              cx="-11"
              cy="9"
              r="3"
              fill="#0f0a07"
            />
            <circle
              cx="11"
              cy="9"
              r="3"
              fill="#0f0a07"
            />
          </g>
          <!-- Rubble: poligoni irregolari -->
          <g v-else-if="d.kind === 'rubble'">
            <polygon
              points="-13,9 -6,-8 5,-10 12,3 10,10 -4,12"
              fill="#2a2520"
              stroke="#13100c"
              stroke-width="1"
            />
            <polygon
              points="-3,-3 6,-7 9,3 1,6"
              fill="#3a3530"
            />
            <polygon
              points="-9,5 -5,2 -3,7 -7,9"
              fill="#1f1c18"
            />
          </g>
          <!-- Crate: cassa di legno -->
          <g v-else-if="d.kind === 'crate'">
            <rect
              x="-8"
              y="-8"
              width="16"
              height="16"
              fill="#5a4628"
              stroke="#22180a"
              stroke-width="1.2"
            />
            <line
              x1="-8"
              y1="0"
              x2="8"
              y2="0"
              stroke="#22180a"
              stroke-width="0.8"
            />
            <line
              x1="0"
              y1="-8"
              x2="0"
              y2="8"
              stroke="#22180a"
              stroke-width="0.8"
            />
          </g>
          <!-- Lamp: palo + alone luce -->
          <g v-else-if="d.kind === 'lamp'">
            <circle
              cx="0"
              cy="-2"
              r="11"
              fill="#d97757"
              opacity="0.10"
            />
            <line
              x1="0"
              y1="-2"
              x2="0"
              y2="20"
              stroke="#2a2520"
              stroke-width="2"
              stroke-linecap="round"
            />
            <circle
              cy="-2"
              r="3"
              fill="#f4c074"
              stroke="#d97757"
              stroke-width="1"
            />
          </g>
          <!-- Fire: brace + fiamma -->
          <g v-else-if="d.kind === 'fire'">
            <ellipse
              cx="0"
              cy="4"
              rx="9"
              ry="3"
              fill="#13100c"
            />
            <ellipse
              cx="0"
              cy="3"
              rx="6"
              ry="2"
              fill="#3a1f12"
            />
            <path
              d="M -4 3 Q -3 -4 0 -8 Q 3 -4 4 3 Z"
              fill="#d9572a"
              opacity="0.9"
            />
            <path
              d="M -2 3 Q -1 -1 0 -5 Q 1 -1 2 3 Z"
              fill="#f4c95a"
              opacity="0.95"
            />
          </g>
        </g>
      </g>

      <!-- Zombies / NPCs -->
      <g
        v-for="z in zombiesInArea"
        :key="z.id"
        :transform="`translate(${z.x}, ${z.y})`"
        :style="isMaster ? 'cursor: pointer' : undefined"
        @mousedown="onZombieMouseDown($event, z)"
      >
        <title>
          {{ z.npcName ? `${z.npcName}${z.npcRole ? ' · ' + z.npcRole : ''}` : (isMaster ? `zombie ${z.id.slice(0, 6)} — ${tool}` : 'zombie') }}
        </title>
        <circle
          v-if="zombies.isSelected(z.id)"
          r="14"
          fill="none"
          :stroke="z.npcName ? 'var(--z-whisper-300)' : 'var(--z-green-300)'"
          stroke-width="2"
          stroke-dasharray="3 3"
        />
        <circle
          r="10"
          :fill="z.npcName ? 'var(--z-bg-700)' : 'var(--z-green-700)'"
          :stroke="z.npcName ? 'var(--z-whisper-300)' : 'var(--z-blood-500)'"
          stroke-width="1.5"
        />
        <text
          text-anchor="middle"
          y="4"
          font-size="12"
          pointer-events="none"
        >{{ z.npcName ? '👤' : '🧟' }}</text>
        <text
          v-if="z.npcName"
          text-anchor="middle"
          y="-14"
          font-size="10"
          fill="var(--z-whisper-300)"
          font-weight="600"
          style="pointer-events: none; user-select: none"
        >{{ z.npcName }}<tspan
          v-if="z.npcRole"
          style="font-weight: 400"
          fill="var(--z-text-lo)"
        > · {{ z.npcRole }}</tspan></text>
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
        <!-- Badge "ha appena parlato" -->
        <g
          v-if="chatStore.lastSpeakerPlayerId === p.id"
          transform="translate(11, -10)"
          style="pointer-events: none"
        >
          <title>Ha parlato di recente</title>
          <ellipse
            rx="9"
            ry="7"
            fill="var(--z-bg-900)"
            stroke="var(--z-green-300)"
            stroke-width="1.5"
          />
          <path
            d="M -3 6 L 0 11 L 2 6 Z"
            fill="var(--z-bg-900)"
            stroke="var(--z-green-300)"
            stroke-width="1.5"
            stroke-linejoin="round"
          />
          <circle
            cx="-4"
            cy="0"
            r="1.2"
            fill="var(--z-green-300)"
          />
          <circle
            cx="0"
            cy="0"
            r="1.2"
            fill="var(--z-green-300)"
          />
          <circle
            cx="4"
            cy="0"
            r="1.2"
            fill="var(--z-green-300)"
          />
        </g>
      </g>
    </svg>

    <!-- NPC spawn modal -->
    <div
      v-if="npcDraft"
      class="absolute inset-0 z-20 flex items-center justify-center"
      style="background: rgba(0,0,0,0.55)"
      @mousedown.self="cancelNpc"
    >
      <form
        class="rounded-md p-4 space-y-3 w-80"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @submit.prevent="confirmNpc"
      >
        <header
          class="text-sm font-semibold"
          style="color: var(--z-whisper-300)"
        >
          Nuovo NPC
        </header>
        <div class="space-y-1">
          <label
            class="block text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Nome
          </label>
          <input
            ref="npcNameInputEl"
            v-model="npcDraft.name"
            type="text"
            required
            maxlength="64"
            placeholder="es. Robert"
            class="w-full bg-transparent border rounded px-2 py-1 text-sm"
            style="border-color: var(--z-border); color: var(--z-text-hi)"
          >
        </div>
        <div class="space-y-1">
          <label
            class="block text-xs uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Ruolo (facoltativo)
          </label>
          <input
            v-model="npcDraft.role"
            type="text"
            list="npc-role-presets"
            maxlength="64"
            placeholder="es. poliziotto"
            class="w-full bg-transparent border rounded px-2 py-1 text-sm"
            style="border-color: var(--z-border); color: var(--z-text-hi)"
          >
          <datalist id="npc-role-presets">
            <option
              v-for="r in NPC_ROLE_PRESETS"
              :key="r"
              :value="r"
            />
          </datalist>
        </div>
        <div class="flex items-center justify-end gap-2 pt-1">
          <UButton
            type="button"
            size="xs"
            color="neutral"
            variant="ghost"
            @click="cancelNpc"
          >
            Annulla
          </UButton>
          <UButton
            type="submit"
            size="xs"
            color="primary"
          >
            Crea NPC
          </UButton>
        </div>
      </form>
    </div>
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
