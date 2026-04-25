<script setup lang="ts">
import { computed, watch, onBeforeUnmount } from 'vue'
import { usePixiApp } from '~/composables/usePixiApp'
import { useGeneratedMap } from '~/composables/useGeneratedMap'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import type { PartyMapPublic } from '~~/shared/protocol/ws'

// T21: rendering minimal viable della mappa via PIXI v8.
// Scope: aree (rect/polygon) con stroke + fill, label, highlight edge/spawn,
// avatar del player corrente, pan & zoom. Niente decor, niente weather,
// niente dettaglio area (T22+). Gli altri player (party.players) restano
// TODO espliciti: il primo cut serve a dimostrare che il canvas funziona.
const props = defineProps<{
  map: PartyMapPublic | null
}>()
const emit = defineEmits<{
  (e: 'area-click', areaId: string): void
}>()

const seed = usePartySeed()
const party = usePartyStore(seed)

const mapTypeId = computed<string | null>(() => props.map?.mapTypeId ?? null)
const mapSeed = computed<string | null>(() => props.map?.mapSeed ?? null)
const params = computed<Record<string, unknown>>(() => props.map?.params ?? {})
const generatedMap = useGeneratedMap(mapTypeId, mapSeed, params)

const { containerRef, app, ready } = usePixiApp({ background: 0x0b0d0c })

// Palette: hex numerici allineati alle custom properties --z-*.
const COLOR_AREA_FILL = 0x1a1e1b // --z-bg-700
const COLOR_AREA_STROKE = 0x656a63 // --z-text-lo
const COLOR_EDGE_STROKE = 0xd4965b // --z-rust-300
const COLOR_SPAWN_STROKE = 0xb96565 // --z-blood-300
const COLOR_LABEL = 0xd4d9d1 // --z-text-hi
const COLOR_AVATAR_SELF = 0x7cbe79 // --z-green-300
const COLOR_AVATAR_INITIAL = 0x0b0d0c // --z-bg-900
// COLOR_ZOMBIE riservato per la T28 quando lo zombies store popolerà il render.

interface ParsedPolygon {
  points: number[]
  bounds: { minX: number, minY: number, maxX: number, maxY: number }
}

function parsePolygonPoints(points: string | undefined): ParsedPolygon | null {
  if (!points) return null
  const flat: number[] = []
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const pair of points.trim().split(/\s+/)) {
    const [xs, ys] = pair.split(',')
    const x = Number(xs)
    const y = Number(ys)
    if (Number.isNaN(x) || Number.isNaN(y)) continue
    flat.push(x, y)
    if (x < minX) minX = x
    if (x > maxX) maxX = x
    if (y < minY) minY = y
    if (y > maxY) maxY = y
  }
  if (flat.length < 6) return null
  return { points: flat, bounds: { minX, minY, maxX, maxY } }
}

let cleanupPanZoom: (() => void) | null = null

function setupPanZoom() {
  if (!app.value) return
  const canvas = app.value.canvas
  let isPanning = false
  let lastX = 0
  let lastY = 0
  // Soglia per distinguere drag da click: sotto questa il pointerup non
  // sopprime l'evento `pointerdown` sui Graphics (gestito da Pixi prima).
  const PAN_THRESHOLD = 4
  let movedBeyondThreshold = false

  const onDown = (e: PointerEvent) => {
    isPanning = true
    movedBeyondThreshold = false
    lastX = e.clientX
    lastY = e.clientY
  }
  const onMove = (e: PointerEvent) => {
    if (!isPanning || !app.value) return
    const dx = e.clientX - lastX
    const dy = e.clientY - lastY
    if (!movedBeyondThreshold && Math.hypot(dx, dy) > PAN_THRESHOLD) {
      movedBeyondThreshold = true
    }
    if (movedBeyondThreshold) {
      app.value.stage.x += dx
      app.value.stage.y += dy
    }
    lastX = e.clientX
    lastY = e.clientY
  }
  const stop = () => {
    isPanning = false
    movedBeyondThreshold = false
  }
  const onWheel = (e: WheelEvent) => {
    e.preventDefault()
    if (!app.value) return
    const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1
    const stage = app.value.stage
    // Zoom focalizzato sul cursore: traslazione in modo che il punto sotto
    // il cursore resti fisso. Senza questo il pan slitta a ogni wheel.
    const rect = canvas.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    const k = factor
    stage.x = cx - (cx - stage.x) * k
    stage.y = cy - (cy - stage.y) * k
    stage.scale.x *= k
    stage.scale.y *= k
  }

  canvas.addEventListener('pointerdown', onDown)
  canvas.addEventListener('pointermove', onMove)
  canvas.addEventListener('pointerup', stop)
  canvas.addEventListener('pointerleave', stop)
  canvas.addEventListener('wheel', onWheel, { passive: false })

  cleanupPanZoom = () => {
    canvas.removeEventListener('pointerdown', onDown)
    canvas.removeEventListener('pointermove', onMove)
    canvas.removeEventListener('pointerup', stop)
    canvas.removeEventListener('pointerleave', stop)
    canvas.removeEventListener('wheel', onWheel)
  }
}

watch([ready, generatedMap], async ([isReady, gm]) => {
  if (!isReady || !app.value || !gm) return
  const PIXI = await import('pixi.js')
  // Race: l'utente potrebbe aver smontato in mezzo al lazy import.
  if (!app.value) return

  const stage = app.value.stage
  stage.removeChildren()

  // Background: solo gradient è supportato dal generator MVP. Per "noise"
  // si fa fallback a un fill flat sul baseColor — su Pixi v8 senza shader
  // custom non vale la pena per T21.
  // NB: il gradient SVG-style va emulato. Per il minimal viable usiamo
  // due rect overlay con alpha decrescente: from in basso, to in alto.
  const w = app.value.screen.width
  const h = app.value.screen.height
  const bg = new PIXI.Graphics()
  if (gm.background.kind === 'gradient') {
    const fromHex = parseInt(gm.background.from.replace('#', ''), 16)
    bg.rect(0, 0, w, h).fill({ color: fromHex, alpha: 1 })
  } else {
    const baseHex = parseInt(gm.background.baseColor.replace('#', ''), 16)
    bg.rect(0, 0, w, h).fill({ color: baseHex, alpha: 1 })
  }
  stage.addChild(bg)

  // Aree
  for (const area of gm.areas) {
    const g = new PIXI.Graphics()
    if (area.shape.kind === 'rect') {
      g.rect(area.shape.x, area.shape.y, area.shape.w, area.shape.h)
    } else {
      const parsed = parsePolygonPoints(area.shape.points)
      if (!parsed) continue
      g.poly(parsed.points)
    }
    g.fill({ color: COLOR_AREA_FILL, alpha: 0.85 })
    const strokeColor = area.spawn
      ? COLOR_SPAWN_STROKE
      : area.edge
        ? COLOR_EDGE_STROKE
        : COLOR_AREA_STROKE
    const strokeWidth = (area.spawn || area.edge) ? 2 : 1
    g.stroke({ width: strokeWidth, color: strokeColor, alpha: 1 })
    g.eventMode = 'static'
    g.cursor = 'pointer'
    g.on('pointerdown', () => emit('area-click', area.id))
    stage.addChild(g)

    // Label centrata. Per polygon usiamo il centroide dei bounds, sufficiente
    // come baseline; centroidi reali sono out of scope per T21.
    const text = new PIXI.Text({
      text: area.name,
      style: {
        fill: COLOR_LABEL,
        fontSize: 12,
        fontFamily: 'monospace'
      }
    })
    let cx = 0
    let cy = 0
    if (area.shape.kind === 'rect') {
      cx = area.shape.x + area.shape.w / 2
      cy = area.shape.y + area.shape.h / 2
    } else {
      const parsed = parsePolygonPoints(area.shape.points)
      if (parsed) {
        cx = (parsed.bounds.minX + parsed.bounds.maxX) / 2
        cy = (parsed.bounds.minY + parsed.bounds.maxY) / 2
      }
    }
    text.x = cx - text.width / 2
    text.y = cy - text.height / 2
    stage.addChild(text)
  }

  // Avatar del player corrente. Gli altri player vivono in `party.players`
  // ma per T21 restano TODO esplicito: il render multi-player passa per
  // T28 (cross-map move + posizioni broadcast).
  const me = party.me
  if (me) {
    const myArea = gm.areas.find(a => a.id === me.currentAreaId)
    if (myArea) {
      let ax = 0
      let ay = 0
      if (myArea.shape.kind === 'rect') {
        ax = myArea.shape.x + myArea.shape.w / 2
        ay = myArea.shape.y + myArea.shape.h / 2
      } else {
        const parsed = parsePolygonPoints(myArea.shape.points)
        if (parsed) {
          ax = (parsed.bounds.minX + parsed.bounds.maxX) / 2
          ay = (parsed.bounds.minY + parsed.bounds.maxY) / 2
        }
      }
      const avatar = new PIXI.Graphics()
      avatar.circle(ax, ay, 14).fill({ color: COLOR_AVATAR_SELF, alpha: 1 })
      avatar.stroke({ width: 2, color: 0x0b0d0c, alpha: 1 })
      stage.addChild(avatar)

      const initial = (me.nickname || '?').charAt(0).toUpperCase()
      const initialText = new PIXI.Text({
        text: initial,
        style: {
          fill: COLOR_AVATAR_INITIAL,
          fontSize: 14,
          fontFamily: 'monospace',
          fontWeight: '700'
        }
      })
      initialText.x = ax - initialText.width / 2
      initialText.y = ay - initialText.height / 2
      stage.addChild(initialText)
    }
  }

  // Setup pan/zoom solo la prima volta che lo stage è pronto. La doppia
  // chiamata farebbe doppi listener — la guard sotto evita la regressione.
  if (!cleanupPanZoom) setupPanZoom()
}, { immediate: true })

onBeforeUnmount(() => {
  if (cleanupPanZoom) {
    cleanupPanZoom()
    cleanupPanZoom = null
  }
})
</script>

<template>
  <div
    ref="containerRef"
    class="w-full h-full overflow-hidden touch-none"
    style="background: var(--z-bg-900)"
  />
</template>
