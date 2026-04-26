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
  // v2d-edit: mapId della mappa attiva (necessario per gli eventi
  // master:area-* che richiedono target mapId). null = mappa legacy.
  mapId?: string | null
  // v2d-shape-B: tipo della mappa (city/country/wasteland) — pilota lo
  // stile delle strade e altri dettagli visivi tematici.
  mapTypeId?: string | null
  // v2d-world: nome della mappa attiva, mostrato nel banner in alto.
  mapName?: string | null
  // v2d-shape-B: Voronoi polygons pre-calcolati lato MapViewSvg, mappati
  // per areaId. Quando presenti l'area si renderizza come Voronoi cell.
  voronoiByArea?: Map<string, string>
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

// v2d-edit: offset di drag live (popolato dai handler di edit più sotto).
// Dichiarato qui per essere già definito quando le computed che lo usano
// vengono valutate.
const liveDragOffset = ref<{ id: string, dx: number, dy: number } | null>(null)

// Aree con l'offset di drag live applicato. Quando il master sta
// trascinando un'area, restituisce la stessa lista con le coord dell'area
// trascinata aggiornate, così MapRoads/MapDecor/MapTransitionDoors si
// aggiornano in tempo reale senza aspettare il commit di pointerup.
const effectiveAreas = computed<readonly Area[]>(() => {
  const live = liveDragOffset.value
  if (!live) return areas.value
  return areas.value.map((a) => {
    if (a.id !== live.id) return a
    return {
      ...a,
      svg: { ...a.svg, x: a.svg.x + live.dx, y: a.svg.y + live.dy }
    }
  })
})

// v2d-roads: mappa coppia normalizzata "a::b" → roadKind override.
// Popolata dagli adjacency overrides della party con kind='add' e
// roadKind != null, filtrati per la mappa attiva.
const roadKindsByPair = computed<Map<string, RoadKind>>(() => {
  const m = new Map<string, RoadKind>()
  if (!props.mapId) return m
  for (const o of party.adjacencyOverrides) {
    if (o.mapId !== props.mapId) continue
    if (o.kind !== 'add') continue
    if (!o.roadKind) continue
    const [a, b] = o.areaA < o.areaB ? [o.areaA, o.areaB] : [o.areaB, o.areaA]
    m.set(`${a}::${b}`, o.roadKind as RoadKind)
  }
  return m
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

// v2d-fog: insieme degli areaId visitati nella mappa attiva. Master
// vede tutto (set vuoto interpretato come "fog disabilitato per il master").
const visitedSetForMap = computed<Set<string>>(() => {
  if (isMaster.value) return new Set() // bypass: niente fog
  if (!props.mapId) return new Set()
  const set = new Set<string>()
  for (const v of party.visitedAreas) {
    if (v.mapId === props.mapId) set.add(v.areaId)
  }
  return set
})

function isFog(areaId: string): boolean {
  if (isMaster.value) return false
  if (!props.mapId) return false
  return !visitedSetForMap.value.has(areaId)
}

const stateById = computed(() => {
  const map = new Map<string, { status: 'intact' | 'infested' | 'ruined' | 'closed', customName: string | null }>()
  for (const s of party.areasState) {
    map.set(s.areaId, { status: s.status, customName: s.customName })
  }
  return map
})

const playersByArea = computed(() => {
  const map = new Map<string, typeof party.players>()
  // v2d-shape-B: se il player ha currentAreaId che non corrisponde ad
  // alcuna area della mappa attiva (es. party legacy creata prima del
  // cambio dei pool nomi → slug obsoleti), fallback sulla spawn area
  // della mappa per renderlo comunque visibile.
  const validIds = new Set(areas.value.map(a => a.id))
  const fallbackId = props.generatedMap?.spawnAreaId ?? areas.value[0]?.id ?? null
  for (const p of party.players) {
    const areaId = validIds.has(p.currentAreaId)
      ? p.currentAreaId
      : (fallbackId ?? p.currentAreaId)
    const list = map.get(areaId) ?? []
    list.push(p)
    map.set(areaId, list)
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

// ── v2d-edit: modalità "Modifica mappa" (master) ────────────────────────────
// Drag area per spostarla, doppio click per rinominare, X per rimuovere,
// click sullo sfondo per aggiungere una nuova area custom.
const editMode = ref(false)
function toggleEdit() {
  if (!isMaster.value) return
  editMode.value = !editMode.value
  // Esce dal menu/edit input se si chiude la modalità
  if (!editMode.value) {
    renamingAreaId.value = null
    renameDraft.value = ''
  }
}

// Conversione coord schermo → coord logiche (1000x700) tenendo conto di
// fit-to-container (contentTransform) + zoom/pan utente (userTransform).
function screenToLogical(clientX: number, clientY: number): { x: number, y: number } | null {
  if (!containerEl.value) return null
  const rect = containerEl.value.getBoundingClientRect()
  const vx = clientX - rect.left
  const vy = clientY - rect.top
  // Inverti userTransform: vx = panX + zoom * vx', → vx' = (vx - panX) / zoom
  const ux = (vx - panX.value) / zoom.value
  const uy = (vy - panY.value) / zoom.value
  // Inverti contentTransform: ux = tx + s * lx → lx = (ux - tx) / s
  const s = contentScale.value
  const tx = (containerW.value - LOGICAL_W * s) / 2
  const ty = (containerH.value - LOGICAL_H * s) / 2
  return { x: (ux - tx) / s, y: (uy - ty) / s }
}

// Drag area
const draggingAreaId = ref<string | null>(null)
const dragOrigin = ref<{ logicalX: number, logicalY: number, areaX: number, areaY: number } | null>(null)
// Marker: true se durante il drag corrente il puntatore si è mosso oltre
// la soglia. Usato per sopprimere il click sintetico che il browser emette
// dopo pointerup, così il drag&drop non triggera onAreaEditClick (toggle
// strada) per sbaglio.
const dragHadMovement = ref(false)
const DRAG_MOVE_THRESHOLD = 3

function startAreaDrag(e: PointerEvent, areaId: string) {
  if (!editMode.value || !props.mapId) return
  const a = areas.value.find(x => x.id === areaId)
  if (!a) return
  const lp = screenToLogical(e.clientX, e.clientY)
  if (!lp) return
  draggingAreaId.value = areaId
  dragOrigin.value = { logicalX: lp.x, logicalY: lp.y, areaX: a.svg.x, areaY: a.svg.y }
  dragHadMovement.value = false
  ;(e.target as Element | null)?.setPointerCapture?.(e.pointerId)
  e.stopPropagation()
}

function moveAreaDrag(e: PointerEvent) {
  if (!draggingAreaId.value || !dragOrigin.value) return
  const lp = screenToLogical(e.clientX, e.clientY)
  if (!lp) return
  const dx = lp.x - dragOrigin.value.logicalX
  const dy = lp.y - dragOrigin.value.logicalY
  if (Math.hypot(dx, dy) > DRAG_MOVE_THRESHOLD) {
    dragHadMovement.value = true
  }
  // Aggiornamento ottimistico locale: il broadcast del server applicherà
  // il delta finale a tutti. Per ora muoviamo solo lo SVG visualmente
  // tramite override transform sul gruppo dell'area (vedi template).
  liveDragOffset.value = { id: draggingAreaId.value, dx, dy }
}

function endAreaDrag(e: PointerEvent) {
  if (!draggingAreaId.value || !dragOrigin.value || !props.mapId) {
    draggingAreaId.value = null
    dragOrigin.value = null
    liveDragOffset.value = null
    return
  }
  const lp = screenToLogical(e.clientX, e.clientY)
  if (!lp) {
    draggingAreaId.value = null
    dragOrigin.value = null
    liveDragOffset.value = null
    return
  }
  const dx = lp.x - dragOrigin.value.logicalX
  const dy = lp.y - dragOrigin.value.logicalY
  const newX = Math.max(0, Math.min(LOGICAL_W, dragOrigin.value.areaX + dx))
  const newY = Math.max(0, Math.min(LOGICAL_H, dragOrigin.value.areaY + dy))
  if (Math.hypot(dx, dy) > 4) {
    connection.send({
      type: 'master:area-move',
      mapId: props.mapId,
      areaId: draggingAreaId.value,
      x: newX,
      y: newY
    })
  }
  draggingAreaId.value = null
  dragOrigin.value = null
  liveDragOffset.value = null
  ;(e.target as Element | null)?.releasePointerCapture?.(e.pointerId)
}

// Rinomina inline
const renamingAreaId = ref<string | null>(null)
const renameDraft = ref('')
function startRename(areaId: string) {
  if (!editMode.value || !props.mapId) return
  const a = areas.value.find(x => x.id === areaId)
  if (!a) return
  renamingAreaId.value = areaId
  renameDraft.value = a.name
}
function commitRename() {
  if (!renamingAreaId.value || !props.mapId) return
  const name = renameDraft.value.trim()
  if (name) {
    connection.send({
      type: 'master:area-rename',
      mapId: props.mapId,
      areaId: renamingAreaId.value,
      name
    })
  }
  renamingAreaId.value = null
  renameDraft.value = ''
}
function cancelRename() {
  renamingAreaId.value = null
  renameDraft.value = ''
}

// Rimuovi area
function removeArea(areaId: string) {
  if (!editMode.value || !props.mapId) return
  if (!confirm('Rimuovere questa area dalla mappa?')) return
  connection.send({
    type: 'master:area-remove',
    mapId: props.mapId,
    areaId
  })
}

// ── v2d-edit: editor strade (adjacency) ────────────────────────────────────
// Click su un'area (dentro l'overlay edit) seleziona l'origine. Click su
// una seconda area aggiunge/rimuove la strada toggle in base allo stato
// corrente: se le aree erano adiacenti → master:road-remove, altrimenti
// master:road-add. Click sulla stessa area = annulla selezione.
type RoadKind = 'urban' | 'path' | 'wasteland' | 'highway' | 'bridge'
const ROAD_KIND_OPTIONS: Array<{ value: RoadKind, label: string }> = [
  { value: 'urban', label: 'Asfalto' },
  { value: 'path', label: 'Sentiero' },
  { value: 'wasteland', label: 'Strada crepata' },
  { value: 'highway', label: 'Autostrada' },
  { value: 'bridge', label: 'Ponte' }
]
const roadFromAreaId = ref<string | null>(null)
const roadKindForNew = ref<RoadKind | 'auto'>('auto')

function onAreaEditClick(areaId: string, e: MouseEvent) {
  if (!editMode.value || !props.mapId) return
  e.stopPropagation()
  // Sopprimi il click sintetico emesso dopo un drag effettivo: il drag
  // ha già committato master:area-move via endAreaDrag, non vogliamo
  // anche un toggle strada.
  if (dragHadMovement.value) {
    dragHadMovement.value = false
    return
  }
  if (!roadFromAreaId.value) {
    roadFromAreaId.value = areaId
    return
  }
  if (roadFromAreaId.value === areaId) {
    roadFromAreaId.value = null
    return
  }
  const a = roadFromAreaId.value
  const b = areaId
  // Già adiacenti? Toggle.
  const adj = adjacency.value[a] ?? []
  const arePaired = adj.includes(b)
  if (arePaired) {
    connection.send({
      type: 'master:road-remove',
      mapId: props.mapId,
      areaA: a,
      areaB: b
    })
  } else {
    connection.send({
      type: 'master:road-add',
      mapId: props.mapId,
      areaA: a,
      areaB: b,
      ...(roadKindForNew.value !== 'auto' ? { roadKind: roadKindForNew.value } : {})
    })
  }
  roadFromAreaId.value = null
}

// Click su una strada: in edit mode rimuove la connessione (o forza
// l'override 'remove' se era automatica via prossimità).
function onRoadClick(areaA: string, areaB: string) {
  if (!editMode.value || !props.mapId) return
  if (!confirm('Rimuovere questa strada?')) return
  connection.send({
    type: 'master:road-remove',
    mapId: props.mapId,
    areaA,
    areaB
  })
}

// ── v2d-edit: status zona (intact / infested / ruined / closed) ────────────
// In edit mode, sotto il bordo dell'area appaiono 4 pulsanti mini per
// cambiare rapidamente lo stato. Riusa il già esistente master:area WS
// event (gestito da handleMasterArea, persistito in areas_state).
type AreaStatus = 'intact' | 'infested' | 'ruined' | 'closed'
const STATUS_OPTIONS: Array<{ value: AreaStatus, color: string, label: string }> = [
  { value: 'intact', color: 'var(--z-green-300, #6ec3a6)', label: 'intatta' },
  { value: 'infested', color: 'var(--z-rust-300, #d97757)', label: 'infestata' },
  { value: 'ruined', color: 'var(--z-text-lo, #6b6b6b)', label: 'in rovina' },
  { value: 'closed', color: 'var(--z-blood-300, #c26f8e)', label: 'chiusa' }
]

function setAreaStatus(areaId: string, status: AreaStatus) {
  if (!editMode.value) return
  connection.send({ type: 'master:area', areaId, status })
}

// Aggiungi area al click sullo sfondo (in edit mode, solo su zona vuota)
function addAreaAtPoint(clientX: number, clientY: number) {
  if (!editMode.value || !props.mapId) return
  const lp = screenToLogical(clientX, clientY)
  if (!lp) return
  const name = prompt('Nome della nuova area:', 'Nuova area')
  if (!name || !name.trim()) return
  // Centro l'area sulla coord cliccata
  const W = 120
  const H = 90
  connection.send({
    type: 'master:area-add',
    mapId: props.mapId,
    name: name.trim().slice(0, 64),
    x: Math.max(0, lp.x - W / 2),
    y: Math.max(0, lp.y - H / 2),
    w: W,
    h: H
  })
}

function onSvgBgClick(e: MouseEvent) {
  if (!editMode.value) return
  // Solo se il click è sullo SVG-background, non su un'area child.
  // Il check è basato sul currentTarget vs target: se uguali, è il bg.
  if (e.currentTarget !== e.target) return
  addAreaAtPoint(e.clientX, e.clientY)
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
        <!-- v2d-fog: pattern per area non esplorata. Tessitura scura
             cross-hatch + base nera. -->
        <pattern
          id="area-fog"
          width="10"
          height="10"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(30)"
        >
          <rect
            width="10"
            height="10"
            fill="#0a0a0a"
          />
          <line
            x1="0"
            y1="0"
            x2="0"
            y2="10"
            stroke="#181818"
            stroke-width="1"
          />
          <line
            x1="5"
            y1="0"
            x2="5"
            y2="10"
            stroke="#141414"
            stroke-width="0.6"
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
        :style="editMode ? 'cursor: crosshair' : ''"
        @click="onSvgBgClick"
      />
      <rect
        :width="containerW"
        :height="containerH"
        filter="url(#map-grain)"
        opacity="0.3"
        style="pointer-events: none"
      />

      <!-- User zoom/pan applicato sopra al fit-to-container -->
      <g :transform="userTransform">
        <!-- Contenuto logico 1000x700 scalato uniformemente e centrato -->
        <g :transform="contentTransform">
          <!-- v2d-shape-B: layer base — poligoni Voronoi (o rect MVP) come
               sfondo cliccabile, sotto strade/decor/avatar/marker. -->
          <g
            v-for="a in effectiveAreas"
            :key="`area-base-${a.id}`"
          >
            <MapArea
              :area="a"
              :state="stateById.get(a.id) ?? null"
              :is-current="currentAreaId === a.id"
              :is-adjacent="adjacentSet.has(a.id)"
              :is-master="isMaster"
              :player-count="(playersByArea.get(a.id)?.length ?? 0)"
              :voronoi-points="props.voronoiByArea?.get(a.id) ?? null"
              :layer="props.voronoiByArea && props.voronoiByArea.size > 0 ? 'base' : 'all'"
              :fog="isFog(a.id)"
              @click="!editMode && onAreaClick(a.id as AreaId)"
            />
          </g>

          <MapDecor :areas="effectiveAreas" />
          <MapRoads
            :areas="effectiveAreas"
            :pairs="adjacencyPairs"
            :map-type-id="props.mapTypeId ?? null"
            :road-kinds="roadKindsByPair"
          />
          <MapTransitionDoors
            :areas="effectiveAreas"
            :transitions="props.transitions ?? []"
            :logical-w="LOGICAL_W"
            :logical-h="LOGICAL_H"
            @transition-click="onTransitionClick"
          />

          <!-- v2d-shape-B: layer marker — solo se Voronoi attivo (per il
               legacy MVP il rect 'all' include già marker+label). -->
          <template v-if="props.voronoiByArea && props.voronoiByArea.size > 0">
            <g
              v-for="a in effectiveAreas"
              :key="`area-marker-${a.id}`"
            >
              <MapArea
                :area="a"
                :state="stateById.get(a.id) ?? null"
                :is-current="currentAreaId === a.id"
                :is-adjacent="adjacentSet.has(a.id)"
                :is-master="isMaster"
                :player-count="(playersByArea.get(a.id)?.length ?? 0)"
                :voronoi-points="props.voronoiByArea?.get(a.id) ?? null"
                layer="marker"
                :fog="isFog(a.id)"
              />
            </g>
          </template>

          <!-- Edit overlay: drag rect + × + status icons. Renderizzato sopra
               tutto così resta cliccabile in edit mode. -->
          <g
            v-for="a in effectiveAreas"
            :key="`area-edit-${a.id}`"
          >
            <!-- v2d-edit: overlay edit master. Drag, doppio-click rinomina,
                 X rimuove. Click singolo seleziona per aggiungere/rimuovere
                 una strada con un'altra area. Hit-area: in modalità Voronoi
                 è il poligono Voronoi intero (così il click arriva ovunque
                 dentro la cell), altrimenti il rect bbox legacy. -->
            <g v-if="editMode">
              <polygon
                v-if="props.voronoiByArea?.get(a.id)"
                :points="props.voronoiByArea.get(a.id)!"
                fill="transparent"
                :stroke="roadFromAreaId === a.id ? 'var(--z-toxic-500, #b3d33a)' : 'var(--z-rust-300)'"
                :stroke-width="roadFromAreaId === a.id ? 3 : 2"
                stroke-dasharray="6 4"
                style="cursor: move"
                stroke-linejoin="round"
                @pointerdown="(e: PointerEvent) => startAreaDrag(e, a.id)"
                @pointermove="moveAreaDrag"
                @pointerup="endAreaDrag"
                @click.stop="(e: MouseEvent) => onAreaEditClick(a.id, e)"
                @dblclick.stop="startRename(a.id)"
              />
              <rect
                v-else
                :x="a.svg.x"
                :y="a.svg.y"
                :width="a.svg.w"
                :height="a.svg.h"
                fill="transparent"
                :stroke="roadFromAreaId === a.id ? 'var(--z-toxic-500, #b3d33a)' : 'var(--z-rust-300)'"
                :stroke-width="roadFromAreaId === a.id ? 3 : 2"
                stroke-dasharray="6 4"
                style="cursor: move"
                @pointerdown="(e: PointerEvent) => startAreaDrag(e, a.id)"
                @pointermove="moveAreaDrag"
                @pointerup="endAreaDrag"
                @click.stop="(e: MouseEvent) => onAreaEditClick(a.id, e)"
                @dblclick.stop="startRename(a.id)"
              />
              <g
                style="cursor: pointer"
                @click.stop="removeArea(a.id)"
              >
                <circle
                  :cx="a.svg.x + a.svg.w - 12"
                  :cy="a.svg.y + 12"
                  r="11"
                  fill="var(--z-blood-700)"
                  stroke="var(--z-blood-300)"
                  stroke-width="1.5"
                />
                <text
                  :x="a.svg.x + a.svg.w - 12"
                  :y="a.svg.y + 16"
                  text-anchor="middle"
                  font-size="14"
                  font-weight="bold"
                  fill="white"
                  style="pointer-events: none; user-select: none"
                >×</text>
              </g>
              <!-- v2d-edit: 4 pulsanti status zona (intact/infested/ruined/closed)
                   in alto a sinistra. Bordo bianco evidenzia lo status corrente. -->
              <g
                v-for="(s, idx) in STATUS_OPTIONS"
                :key="`st-${a.id}-${s.value}`"
                style="cursor: pointer"
                @click.stop="setAreaStatus(a.id, s.value)"
              >
                <title>{{ s.label }}</title>
                <circle
                  :cx="a.svg.x + 12 + idx * 16"
                  :cy="a.svg.y + 12"
                  r="6"
                  :fill="s.color"
                  :stroke="(stateById.get(a.id)?.status ?? 'intact') === s.value ? 'white' : 'transparent'"
                  stroke-width="2"
                />
              </g>
            </g>
          </g>

          <!-- v2d-edit: hit-area cliccabile per ogni strada in edit mode.
               Renderizzata SOPRA l'edit overlay (i polygon Voronoi che
               coprono l'intera cella) così il click sulla linea finisce
               qui (rimozione strada) e non sul polygon (selezione area). -->
          <g v-if="editMode">
            <line
              v-for="[a, b] in adjacencyPairs"
              :key="`hit-${a}-${b}`"
              :x1="(effectiveAreas.find(x => x.id === a)?.svg.x ?? 0) + (effectiveAreas.find(x => x.id === a)?.svg.w ?? 0) / 2"
              :y1="(effectiveAreas.find(x => x.id === a)?.svg.y ?? 0) + (effectiveAreas.find(x => x.id === a)?.svg.h ?? 0) / 2"
              :x2="(effectiveAreas.find(x => x.id === b)?.svg.x ?? 0) + (effectiveAreas.find(x => x.id === b)?.svg.w ?? 0) / 2"
              :y2="(effectiveAreas.find(x => x.id === b)?.svg.y ?? 0) + (effectiveAreas.find(x => x.id === b)?.svg.h ?? 0) / 2"
              stroke="var(--z-blood-300)"
              stroke-width="18"
              stroke-opacity="0"
              style="cursor: pointer"
              @click.stop="onRoadClick(a, b)"
            />
          </g>

          <template
            v-for="a in effectiveAreas"
            :key="`av-${a.id}`"
          >
            <MapAvatar
              v-for="(p, i) in visiblePlayersFor(a).visible"
              :key="p.id"
              :player="p"
              :area="a"
              :index="i"
              :is-self="party.me?.id === p.id"
              :centered="!!(props.voronoiByArea && props.voronoiByArea.size > 0)"
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

    <!-- v2d-world: banner mappa corrente + toggle 🌐 Mondo. Mostra in
         che mappa si trova il player; click apre la vista mondo. -->
    <div class="absolute top-3 left-1/2 -translate-x-1/2 z-10">
      <button
        type="button"
        class="px-3 py-1.5 rounded text-xs font-mono-z flex items-center gap-2"
        style="background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)"
        title="Apri vista mondo"
        @click="viewStore.openWorld()"
      >
        <span style="color: var(--z-text-hi); font-weight: 600">
          🗺 {{ props.mapName ?? 'Mappa' }}
        </span>
        <span
          v-if="props.mapTypeId"
          class="px-1.5 py-0.5 rounded"
          style="background: var(--z-bg-900); color: var(--z-text-md); font-size: 0.85em"
        >
          {{ props.mapTypeId }}
        </span>
        <span style="color: var(--z-text-md); border-left: 1px solid var(--z-border); padding-left: 8px; margin-left: 2px">
          🌐 Mondo
        </span>
      </button>
    </div>

    <!-- v2d-edit: toggle "Modifica mappa" (master only, solo se mapId valido).
         Top-left per non collidere con MapPlayersBox (top-right). -->
    <div
      v-if="isMaster && props.mapId"
      class="absolute top-3 left-3 z-10"
    >
      <button
        type="button"
        class="px-3 py-1.5 rounded text-xs font-mono-z"
        :style="editMode
          ? 'background: var(--z-rust-700); color: var(--z-rust-300); border: 1px solid var(--z-rust-300)'
          : 'background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)'"
        @click="toggleEdit"
      >
        {{ editMode ? '✎ Modifica ON' : '✎ Modifica mappa' }}
      </button>
      <div
        v-if="editMode"
        class="mt-1 text-xs font-mono-z space-y-1"
        style="color: var(--z-text-md); max-width: 280px"
      >
        <p>drag = sposta · doppio-click = rinomina · × = rimuovi</p>
        <p>click vuoto = aggiungi area</p>
        <p>click area + click area = aggiungi/rimuovi strada</p>
        <p>click strada = rimuovi</p>
        <div
          class="mt-1 flex items-center gap-1.5 pt-1"
          style="border-top: 1px solid var(--z-border)"
        >
          <span style="color: var(--z-text-md)">tipo strada:</span>
          <select
            v-model="roadKindForNew"
            class="px-1.5 py-0.5 rounded text-xs"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
          >
            <option value="auto">
              auto ({{ props.mapTypeId ?? 'mvp' }})
            </option>
            <option
              v-for="opt in ROAD_KIND_OPTIONS"
              :key="opt.value"
              :value="opt.value"
            >
              {{ opt.label }}
            </option>
          </select>
        </div>
        <p
          v-if="roadFromAreaId"
          class="pt-0.5"
          style="color: var(--z-toxic-500, #b3d33a)"
        >
          ↪ origine selezionata, clicca un'altra area
        </p>
      </div>
    </div>

    <!-- v2d-edit: input inline rinomina (overlay assoluto). -->
    <div
      v-if="renamingAreaId"
      class="absolute top-1/2 left-1/2 z-20 -translate-x-1/2 -translate-y-1/2 p-3 rounded shadow-lg"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border); min-width: 260px"
    >
      <p
        class="text-xs uppercase tracking-wide mb-2"
        style="color: var(--z-text-md)"
      >
        Rinomina area
      </p>
      <input
        v-model="renameDraft"
        type="text"
        maxlength="64"
        class="w-full px-2 py-1.5 rounded text-sm font-mono-z"
        style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        autofocus
        @keyup.enter="commitRename"
        @keyup.escape="cancelRename"
      >
      <div class="mt-2 flex gap-1.5 justify-end">
        <UButton
          size="xs"
          variant="ghost"
          @click="cancelRename"
        >
          Annulla
        </UButton>
        <UButton
          size="xs"
          color="primary"
          @click="commitRename"
        >
          Salva
        </UButton>
      </div>
    </div>

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
