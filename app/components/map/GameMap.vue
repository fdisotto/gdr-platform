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
import { useVoronoiPolygons } from '~/composables/useVoronoiPolygons'

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
  // v2d-edit: coppie "a::b" (a < b) marcate come strada interrotta dal
  // master. Le strade compaiono visivamente con stile rotto e i player
  // non possono attraversarle finche il master le ripara.
  brokenPairs?: Set<string>
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

// v2d-shape-B: tessellation Voronoi derivata dalle effectiveAreas, così
// durante il drag il poligono della cella segue il puntatore in tempo
// reale insieme a strade/decor. Calcolata solo per le mappe v2d
// (generatedMap presente); per la legacy resta vuota → fallback ai rect.
// `meshPath` è il path SVG dei bordi condivisi disegnati una sola volta:
// le celle Voronoi non hanno stroke, il bordo lo dà il mesh.
const voronoiAreasInput = computed(() => {
  if (!props.generatedMap) return []
  return effectiveAreas.value.map(a => ({
    id: a.id,
    shape: { x: a.svg.x, y: a.svg.y, w: a.svg.w, h: a.svg.h }
  }))
})
const voronoiData = useVoronoiPolygons(voronoiAreasInput, LOGICAL_W, LOGICAL_H)
const voronoiByArea = computed(() => voronoiData.value.byArea)
const voronoiMeshPath = computed(() => voronoiData.value.meshPath)
const hasVoronoi = computed(() => voronoiByArea.value.size > 0)

const containerEl = ref<HTMLElement | null>(null)
const containerW = ref<number>(LOGICAL_W)
const containerH = ref<number>(LOGICAL_H)
const viewBox = computed(() => `0 0 ${containerW.value} ${containerH.value}`)
// 'meet' (Math.min): il LOGICAL 1000x700 si rimpicciolisce per stare
// dentro il container preservando aspect. lascia letterbox sui lati
// del LOGICAL ma il bg del SVG e' uniforme #0b0d0c uguale al body
// → letterbox invisibile, niente "quadratone". e con zoom < 1 si
// vede comunque tutto il LOGICAL senza tagli.
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
// zoom in [0.5, 4]: con il content scale 'cover' la mappa parte gia'
// piena, ma serve poter zoomare fuori per vedere il contesto attorno.
const MIN_ZOOM = 0.5
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

// v2d-fog: stato del toggle fog visualizzato dal master. Default true
// (server pre-fix non manda fogEnabled → trattalo come attivo).
const fogEnabledForParty = computed(() => party.party?.fogEnabled !== false)
function toggleFog() {
  if (!isMaster.value) return
  connection.send({ type: 'master:fog', enabled: !fogEnabledForParty.value })
}

// v2d-master: rinomina città (= cityName del party). Modal inline al
// click sul nome città nel pannello master.
const cityName = computed(() => party.party?.cityName ?? 'Città')
const renamingCity = ref(false)
const cityDraft = ref('')
function startCityRename() {
  if (!isMaster.value) return
  cityDraft.value = cityName.value
  renamingCity.value = true
}
function commitCityRename() {
  const name = cityDraft.value.trim().slice(0, 64)
  if (!name) {
    renamingCity.value = false
    return
  }
  connection.send({ type: 'master:set-city-name', name })
  renamingCity.value = false
}
function cancelCityRename() {
  renamingCity.value = false
  cityDraft.value = ''
}

// Master dashboard collassabile: niente più pulsanti master sparsi
// nei 4 angoli. Apre/chiude un singolo pannello con tutte le azioni.
const masterPanelOpen = ref(false)
function toggleMasterPanel() {
  masterPanelOpen.value = !masterPanelOpen.value
}

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

// v2d-fog: livello di fog per ogni area dal punto di vista del player
// corrente. 3 stati:
// - 'none' → area visitata, area corrente o master (visibilità piena)
// - 'adjacent' → adiacente alla mia area corrente, mai visitata
//   (silhouette + "?", niente nome / player count)
// - 'unknown' → tutte le altre non visitate (cella nera uniforme)
// Visitando una nuova area entra nel visitedSet via WS broadcast e
// passa permanentemente a 'none'.
function fogLevelFor(areaId: string): 'none' | 'adjacent' | 'unknown' {
  if (isMaster.value) return 'none'
  if (!props.mapId) return 'none'
  // v2d-fog: master può disattivare la fog party-wide. fogEnabled
  // mancante (server pre-fix) = trattato come true.
  if (party.party?.fogEnabled === false) return 'none'
  if (visitedSetForMap.value.has(areaId)) return 'none'
  if (currentAreaId.value === areaId) return 'none'
  if (adjacentSet.value.has(areaId)) return 'adjacent'
  return 'unknown'
}

// Aree completamente sconosciute: nere, e devono coprire anche strade/
// decor incidenti che provengono da zone visibili. Per questo serve un
// overlay nero renderizzato DOPO MapRoads/MapDecor/MapTransitionDoors.
const unknownAreas = computed<readonly Area[]>(() => {
  return effectiveAreas.value.filter(a => fogLevelFor(a.id) === 'unknown')
})

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

function pairKeyOf(a: string, b: string): string {
  return a < b ? `${a}::${b}` : `${b}::${a}`
}

function isBrokenBetween(a: string, b: string): boolean {
  if (!props.brokenPairs) return false
  return props.brokenPairs.has(pairKeyOf(a, b))
}

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
  // Master può muoversi ovunque; user solo in area adiacente, non chiusa
  // e con la strada NON marcata "broken".
  if (!isMasterRole) {
    const adj = new Set<string>(adjacency.value[myArea] ?? [])
    if (!adj.has(areaId)) return // non raggiungibile, no-op
    if (isBrokenBetween(myArea, areaId)) return // strada interrotta
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
    addAreaPending.value = false
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

// Click su una strada in edit mode: apre un mini menu modale con
// pulsanti rimuovi / rompi / ripara. Shift+click resta come shortcut
// per togglare rapidamente rotta/intatta senza menu.
const roadMenu = ref<{ areaA: string, areaB: string, isBroken: boolean } | null>(null)
function onRoadClick(areaA: string, areaB: string, e: MouseEvent) {
  if (!editMode.value || !props.mapId) return
  const isBroken = isBrokenBetween(areaA, areaB)
  if (e.shiftKey) {
    connection.send({
      type: 'master:road-break',
      mapId: props.mapId,
      areaA,
      areaB,
      broken: !isBroken
    })
    return
  }
  roadMenu.value = { areaA, areaB, isBroken }
}
function closeRoadMenu() {
  roadMenu.value = null
}
function roadMenuRemove() {
  if (!roadMenu.value || !props.mapId) return
  connection.send({
    type: 'master:road-remove',
    mapId: props.mapId,
    areaA: roadMenu.value.areaA,
    areaB: roadMenu.value.areaB
  })
  closeRoadMenu()
}
function roadMenuToggleBroken(broken: boolean) {
  if (!roadMenu.value || !props.mapId) return
  connection.send({
    type: 'master:road-break',
    mapId: props.mapId,
    areaA: roadMenu.value.areaA,
    areaB: roadMenu.value.areaB,
    broken
  })
  closeRoadMenu()
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

// Equivalente di /open e /close dalla chat: se la zona è 'closed' la
// riapre come 'intact'; altrimenti la chiude. Lascia invariato lo
// status su infested/ruined → diventa direttamente closed.
function toggleAreaOpenClose(areaId: string) {
  if (!editMode.value) return
  const cur = stateById.value.get(areaId)?.status ?? 'intact'
  const next: AreaStatus = cur === 'closed' ? 'intact' : 'closed'
  connection.send({ type: 'master:area', areaId, status: next })
}

// Aggiungi area al click sullo SVG (in modalità "+ Nuova area"). In
// modalità Voronoi le celle riempiono tutto il viewBox, quindi non c'è
// più un "vuoto" cliccabile: usiamo un flag esplicito attivato dal
// pulsante "+ Nuova area" del pannello edit. Il prossimo click in
// qualsiasi punto inserisce la nuova area lì e disattiva il flag.
const addAreaPending = ref(false)

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

// Capture-phase: intercetta il click PRIMA degli handler delle celle/
// strade, così "+ Nuova area" funziona anche cliccando sopra una cella
// esistente. Senza il flag attivo, niente effetti collaterali.
function onSvgClickCapture(e: MouseEvent) {
  if (!editMode.value || !addAreaPending.value) return
  e.stopPropagation()
  e.preventDefault()
  addAreaAtPoint(e.clientX, e.clientY)
  addAreaPending.value = false
}
</script>

<template>
  <section
    ref="containerEl"
    class="w-full relative flex-1 min-h-0 select-none"
    style="background: var(--z-bg-900)"
  >
    <svg
      :viewBox="viewBox"
      preserveAspectRatio="none"
      style="width: 100%; height: 100%; display: block; touch-action: none"
      :style="isPanning
        ? 'cursor: grabbing'
        : (editMode && addAreaPending ? 'cursor: crosshair' : '')"
      @click.capture="onSvgClickCapture"
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
        <!-- Bg uniforme: prima era un radial #151a16 → #0b0d0c, ma le
             celle voronoi hanno fill-opacity ~0.40 e lasciavano
             trasparire il bg scuro ai bordi → effetto vignetta che si
             percepiva come "il content si sfuma". Ora uniforme. -->
        <radialGradient
          id="map-bg"
          cx="50%"
          cy="50%"
          r="75%"
        >
          <stop
            offset="0%"
            stop-color="#0e1110"
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
        <!-- v2d-shape-B: mask SVG che fa fade-out reale del contenuto
             ai bordi (le celle voronoi diventano trasparenti, non sono
             solo coperte da un overlay): bianco al centro, nero ai
             4 lati. Cosi' la linea retta del bordo del LOGICAL_W/H
             non e' piu' visibile nemmeno con celle current verdi che
             toccano il bordo. -->
        <linearGradient
          id="mask-fade-top"
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop
            offset="0%"
            stop-color="black"
            stop-opacity="1"
          />
          <stop
            offset="55%"
            stop-color="black"
            stop-opacity="0.25"
          />
          <stop
            offset="100%"
            stop-color="black"
            stop-opacity="0"
          />
        </linearGradient>
        <linearGradient
          id="mask-fade-bottom"
          x1="0"
          y1="1"
          x2="0"
          y2="0"
        >
          <stop
            offset="0%"
            stop-color="black"
            stop-opacity="1"
          />
          <stop
            offset="55%"
            stop-color="black"
            stop-opacity="0.25"
          />
          <stop
            offset="100%"
            stop-color="black"
            stop-opacity="0"
          />
        </linearGradient>
        <linearGradient
          id="mask-fade-left"
          x1="0"
          y1="0"
          x2="1"
          y2="0"
        >
          <stop
            offset="0%"
            stop-color="black"
            stop-opacity="1"
          />
          <stop
            offset="55%"
            stop-color="black"
            stop-opacity="0.25"
          />
          <stop
            offset="100%"
            stop-color="black"
            stop-opacity="0"
          />
        </linearGradient>
        <linearGradient
          id="mask-fade-right"
          x1="1"
          y1="0"
          x2="0"
          y2="0"
        >
          <stop
            offset="0%"
            stop-color="black"
            stop-opacity="1"
          />
          <stop
            offset="55%"
            stop-color="black"
            stop-opacity="0.25"
          />
          <stop
            offset="100%"
            stop-color="black"
            stop-opacity="0"
          />
        </linearGradient>
        <!-- Mask in coord LOGICAL (1000x700): fade ai bordi del rect
             logico cosi' le celle voronoi vicine al bordo sfumano nel
             bg solid invece di terminare con la linea netta del LOGICAL.
             Applicata al gruppo contentTransform (sotto userTransform):
             user-space = LOGICAL. Fade di 60 unita' LOGICAL per lato. -->
        <mask
          id="map-soft-edge"
          maskUnits="userSpaceOnUse"
          x="0"
          y="0"
          :width="LOGICAL_W"
          :height="LOGICAL_H"
        >
          <rect
            :width="LOGICAL_W"
            :height="LOGICAL_H"
            fill="white"
          />
          <rect
            :width="LOGICAL_W"
            height="60"
            fill="url(#mask-fade-top)"
          />
          <rect
            :y="LOGICAL_H - 60"
            :width="LOGICAL_W"
            height="60"
            fill="url(#mask-fade-bottom)"
          />
          <rect
            width="60"
            :height="LOGICAL_H"
            fill="url(#mask-fade-left)"
          />
          <rect
            :x="LOGICAL_W - 60"
            width="60"
            :height="LOGICAL_H"
            fill="url(#mask-fade-right)"
          />
        </mask>
      </defs>
      <!-- Bg solid identico al body bg: con meet il LOGICAL ha
           letterbox laterali, e con questo colore identico al
           contenitore esterno il bordo del LOGICAL diventa invisibile.
           Niente piu' "quadratone". -->
      <rect
        :width="containerW"
        :height="containerH"
        fill="#0b0d0c"
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
        <!-- Contenuto logico 1000x700 scalato uniformemente e centrato.
             mask: sfuma i bordi del LOGICAL nel bg solid sottostante. -->
        <g
          :transform="contentTransform"
          mask="url(#map-soft-edge)"
        >
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
              :voronoi-points="voronoiByArea.get(a.id) ?? null"
              :layer="hasVoronoi ? 'base' : 'all'"
              :fog-level="fogLevelFor(a.id)"
              @click="!editMode && onAreaClick(a.id as AreaId)"
            />
          </g>

          <!-- v2d-shape-B: mesh dei bordi condivisi disegnato una sola
               volta per evitare il "doppio bordo" (ogni cella tracciava
               lo stesso edge della cella vicina). Le celle in MapArea
               sono renderizzate senza stroke base. In edit mode il mesh
               diventa dashed rust per dare feedback "stai modificando". -->
          <path
            v-if="hasVoronoi"
            :d="voronoiMeshPath"
            fill="none"
            :stroke="editMode ? 'var(--z-rust-300)' : 'var(--z-green-700)'"
            :stroke-width="editMode ? 1.2 : 1"
            :stroke-dasharray="editMode ? '6 4' : ''"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-opacity="0.9"
            pointer-events="none"
          />
          <MapDecor
            :areas="effectiveAreas"
            :map-type-id="props.mapTypeId ?? null"
          />
          <MapRoads
            :areas="effectiveAreas"
            :pairs="adjacencyPairs"
            :map-type-id="props.mapTypeId ?? null"
            :road-kinds="roadKindsByPair"
            :broken-pairs="props.brokenPairs"
          />
          <!-- v2d-fog: copertura nera SOPRA strade/decor/porte per le
               zone 'unknown'. Le strade che partono da zone visibili
               verso una unknown vengono coperte all'ingresso → effetto
               "qui finisce ciò che conosci". -->
          <g
            v-if="hasVoronoi && unknownAreas.length > 0"
            pointer-events="none"
          >
            <polygon
              v-for="a in unknownAreas"
              :key="`fog-${a.id}`"
              :points="voronoiByArea.get(a.id) ?? ''"
              fill="#050606"
            />
          </g>

          <!-- v2d-shape-B: layer marker — solo se Voronoi attivo (per il
               legacy MVP il rect 'all' include già marker+label). -->
          <template v-if="hasVoronoi">
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
                :voronoi-points="voronoiByArea.get(a.id) ?? null"
                layer="marker"
                :fog-level="fogLevelFor(a.id)"
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
                v-if="voronoiByArea.get(a.id)"
                :points="voronoiByArea.get(a.id)!"
                fill="transparent"
                :stroke="roadFromAreaId === a.id ? 'var(--z-toxic-500, #b3d33a)' : 'transparent'"
                :stroke-width="roadFromAreaId === a.id ? 3 : 0"
                stroke-linejoin="round"
                style="cursor: move"
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
              <!-- v2d-edit: toggle apri/chiudi area inline (= /open e /close
                   da chat). Se chiusa → click apre (intact); altrimenti → chiude. -->
              <g
                style="cursor: pointer"
                @click.stop="toggleAreaOpenClose(a.id)"
              >
                <title>{{ (stateById.get(a.id)?.status ?? 'intact') === 'closed' ? 'Apri zona' : 'Chiudi zona' }}</title>
                <circle
                  :cx="a.svg.x + a.svg.w - 36"
                  :cy="a.svg.y + 12"
                  r="11"
                  :fill="(stateById.get(a.id)?.status ?? 'intact') === 'closed' ? 'var(--z-green-700)' : 'var(--z-bg-700)'"
                  :stroke="(stateById.get(a.id)?.status ?? 'intact') === 'closed' ? 'var(--z-green-300)' : 'var(--z-text-md)'"
                  stroke-width="1.5"
                />
                <text
                  :x="a.svg.x + a.svg.w - 36"
                  :y="a.svg.y + 16"
                  text-anchor="middle"
                  font-size="11"
                  fill="white"
                  style="pointer-events: none; user-select: none"
                >{{ (stateById.get(a.id)?.status ?? 'intact') === 'closed' ? '🔓' : '🔒' }}</text>
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
              @click.stop="(e: MouseEvent) => onRoadClick(a, b, e)"
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
              :centered="hasVoronoi"
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
      <!-- v2d-T28: porte di transizione cross-map renderizzate FUORI
           dal gruppo masked: la mask sfuma il content ai bordi, ma le
           porte (che terminano sul bordo del LOGICAL) devono restare
           visibili e cliccabili al 100%. -->
      <g :transform="userTransform">
        <g :transform="contentTransform">
          <MapTransitionDoors
            :areas="effectiveAreas"
            :transitions="props.transitions ?? []"
            :logical-w="LOGICAL_W"
            :logical-h="LOGICAL_H"
            @transition-click="onTransitionClick"
          />
        </g>
      </g>
    </svg>
    <MapLegend />
    <MapPlayersBox />

    <!-- Top-left: banner mappa (per tutti) + master dashboard collassabile.
         Tutto raggruppato in un unico stack invece che pulsanti sparsi. -->
    <div class="absolute top-3 left-3 z-10 flex flex-col gap-1.5 items-start">
      <!-- v2d-world: banner mappa corrente + toggle 🌐 Mondo (per tutti) -->
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

      <!-- v2d-master: pannello dashboard. Toggle compatto + drawer
           espanso con sezioni Città / Mappa / Visibilità. -->
      <div
        v-if="isMaster"
        class="rounded-md font-mono-z text-xs"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border); min-width: 220px; max-width: 300px"
      >
        <button
          type="button"
          class="w-full px-3 py-1.5 flex items-center justify-between gap-2 rounded-md"
          style="color: var(--z-text-hi)"
          @click="toggleMasterPanel"
        >
          <span class="flex items-center gap-2">
            <span style="color: var(--z-rust-300)">🛠</span>
            <span>Master</span>
          </span>
          <span style="color: var(--z-text-md)">{{ masterPanelOpen ? '▾' : '▸' }}</span>
        </button>
        <div
          v-if="masterPanelOpen"
          class="px-3 pb-3 space-y-3"
          style="border-top: 1px solid var(--z-border)"
        >
          <!-- ── 1) Mappa: azione primaria (in alto) ──────────── -->
          <section
            v-if="props.mapId"
            class="pt-3 space-y-1.5"
          >
            <h3
              class="text-[10px] uppercase tracking-wider"
              style="color: var(--z-text-md)"
            >
              🗺 Mappa
            </h3>
            <button
              type="button"
              class="w-full px-2 py-1.5 rounded flex items-center justify-between"
              :style="editMode
                ? 'background: var(--z-rust-700); color: var(--z-rust-300); border: 1px solid var(--z-rust-300)'
                : 'background: var(--z-bg-900); color: var(--z-text-md); border: 1px solid var(--z-border)'"
              @click="toggleEdit"
            >
              <span>Modifica mappa</span>
              <span style="font-weight: 600">{{ editMode ? 'ON' : 'OFF' }}</span>
            </button>
            <div
              v-if="editMode"
              class="space-y-2.5 pt-1"
              style="color: var(--z-text-md)"
            >
              <!-- Sotto-sezione: Aree -->
              <div class="space-y-1">
                <h4
                  class="text-[10px] uppercase tracking-wide"
                  style="color: var(--z-text-lo)"
                >
                  Aree
                </h4>
                <button
                  type="button"
                  class="w-full px-2 py-1 rounded text-left"
                  :style="addAreaPending
                    ? 'background: var(--z-toxic-700, #4a5d1a); color: var(--z-toxic-300, #d4ea7a); border: 1px solid var(--z-toxic-300, #b3d33a)'
                    : 'background: var(--z-bg-900); color: var(--z-text-hi); border: 1px solid var(--z-border)'"
                  @click="addAreaPending = !addAreaPending"
                >
                  {{ addAreaPending ? '× annulla — clicca un punto' : '+ nuova area' }}
                </button>
                <p
                  class="text-[11px] leading-relaxed"
                  style="color: var(--z-text-lo)"
                >
                  drag = sposta · dbl-click = rinomina · × = rimuovi
                </p>
              </div>

              <!-- Sotto-sezione: Strade -->
              <div
                class="space-y-1 pt-2"
                style="border-top: 1px dashed var(--z-border)"
              >
                <h4
                  class="text-[10px] uppercase tracking-wide"
                  style="color: var(--z-text-lo)"
                >
                  Strade
                </h4>
                <div class="flex items-center gap-1.5">
                  <span class="shrink-0">tipo:</span>
                  <select
                    v-model="roadKindForNew"
                    class="flex-1 px-1.5 py-0.5 rounded"
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
                  class="text-[11px] leading-relaxed"
                  style="color: var(--z-text-lo)"
                >
                  click area + area = aggiungi/togli<br>
                  click strada = rimuovi/rompi/ripara<br>
                  shift+click = toggle rotta
                </p>
                <p
                  v-if="roadFromAreaId"
                  class="text-[11px]"
                  style="color: var(--z-toxic-500, #b3d33a)"
                >
                  ↪ origine selezionata, clicca un'altra area
                </p>
              </div>
            </div>
          </section>

          <!-- ── 2) Visibilità ─────────────────────────────────── -->
          <section
            class="space-y-1.5 pt-3"
            style="border-top: 1px solid var(--z-border)"
          >
            <h3
              class="text-[10px] uppercase tracking-wider"
              style="color: var(--z-text-md)"
            >
              👁 Visibilità
            </h3>
            <button
              type="button"
              class="w-full px-2 py-1.5 rounded flex items-center justify-between"
              :style="fogEnabledForParty
                ? 'background: var(--z-bg-900); color: var(--z-text-md); border: 1px solid var(--z-border)'
                : 'background: var(--z-green-700); color: var(--z-green-100); border: 1px solid var(--z-green-300)'"
              :title="fogEnabledForParty ? 'Fog of war attiva — i player vedono solo zone esplorate. Clicca per disattivare.' : 'Fog of war disattivata — tutti vedono la mappa intera.'"
              @click="toggleFog"
            >
              <span>Fog of war</span>
              <span style="font-weight: 600">{{ fogEnabledForParty ? 'ON' : 'OFF' }}</span>
            </button>
          </section>

          <!-- ── 3) Party ──────────────────────────────────────── -->
          <section
            class="space-y-1.5 pt-3"
            style="border-top: 1px solid var(--z-border)"
          >
            <h3
              class="text-[10px] uppercase tracking-wider"
              style="color: var(--z-text-md)"
            >
              🏙 Party
            </h3>
            <div
              v-if="!renamingCity"
              class="flex items-center gap-2"
            >
              <span
                class="flex-1 truncate"
                style="color: var(--z-text-hi)"
              >{{ cityName }}</span>
              <button
                type="button"
                class="px-1.5 py-0.5 rounded hover:bg-black/30"
                style="color: var(--z-rust-300)"
                title="Rinomina party"
                @click="startCityRename"
              >
                ✎
              </button>
            </div>
            <div
              v-else
              class="flex items-center gap-1"
            >
              <input
                v-model="cityDraft"
                type="text"
                maxlength="64"
                class="flex-1 px-2 py-0.5 rounded"
                style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
                autofocus
                @keyup.enter="commitCityRename"
                @keyup.escape="cancelCityRename"
              >
              <button
                type="button"
                class="px-1.5 py-0.5 rounded"
                style="background: var(--z-green-700); color: var(--z-green-100)"
                @click="commitCityRename"
              >
                ✓
              </button>
              <button
                type="button"
                class="px-1.5 py-0.5 rounded"
                style="color: var(--z-text-md)"
                @click="cancelCityRename"
              >
                ×
              </button>
            </div>
          </section>
        </div>
      </div>
    </div>

    <!-- v2d-edit: modal azioni strada (rimuovi / rompi / ripara). -->
    <div
      v-if="roadMenu"
      class="absolute inset-0 z-30 flex items-center justify-center"
      style="background: rgba(0, 0, 0, 0.55)"
      @click.self="closeRoadMenu"
    >
      <div
        class="rounded-md p-4 space-y-3 min-w-[280px]"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @click.stop
      >
        <header
          class="text-xs uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Strada — {{ roadMenu.areaA }} ↔ {{ roadMenu.areaB }}
        </header>
        <p
          v-if="roadMenu.isBroken"
          class="text-sm"
          style="color: var(--z-blood-300)"
        >
          ⚠ La strada è interrotta: i player non possono attraversarla.
        </p>
        <p
          v-else
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          La strada è intatta e attraversabile.
        </p>
        <div class="flex flex-col gap-1.5">
          <UButton
            v-if="!roadMenu.isBroken"
            size="sm"
            color="warning"
            block
            @click="roadMenuToggleBroken(true)"
          >
            ✖ Rompi strada
          </UButton>
          <UButton
            v-else
            size="sm"
            color="primary"
            block
            @click="roadMenuToggleBroken(false)"
          >
            🔧 Ripara strada
          </UButton>
          <UButton
            size="sm"
            color="error"
            variant="soft"
            block
            @click="roadMenuRemove"
          >
            🗑 Rimuovi strada
          </UButton>
          <UButton
            size="sm"
            variant="ghost"
            block
            @click="closeRoadMenu"
          >
            Annulla
          </UButton>
        </div>
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
