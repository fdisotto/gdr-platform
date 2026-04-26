<script setup lang="ts">
import { computed } from 'vue'
import { Delaunay } from 'd3-delaunay'
import { usePartySeed } from '~/composables/usePartySeed'
import { usePartyStore } from '~/stores/party'
import { useViewStore } from '~/stores/view'
import { generate } from '~~/shared/map/generators'
import type { GeneratedMap } from '~~/shared/map/generators/types'
import type { PartyMapPublic } from '~~/shared/protocol/ws'

// v2d-world: vista mondo. Tile per ogni mappa della party con miniatura
// Voronoi a bassa risoluzione (200×140), nome, tipo, badge isSpawn,
// linee tratteggiate per le transition cross-map. Fog of war:
// - master: vede tutte le mappe e tutte le aree.
// - non-master: vede una mappa solo se ha esplorato almeno un'area di
//   essa; le mappe completamente fog appaiono come tile coperto da "?".

const seed = usePartySeed()
const party = usePartyStore(seed)
const viewStore = useViewStore(seed)

const TILE_W = 240
const TILE_H = 168
const VIEW_W = 1000
const VIEW_H = 700
const SCALE_X = TILE_W / VIEW_W
const SCALE_Y = TILE_H / VIEW_H

const isMaster = computed(() => party.me?.role === 'master')

interface Tile {
  map: PartyMapPublic
  generated: GeneratedMap | null
  voronoi: Map<string, string>
  visitedAreaIds: Set<string>
  fullyFogged: boolean
}

const tiles = computed<Tile[]>(() => {
  return party.maps.map((m) => {
    let gm: GeneratedMap | null = null
    try {
      gm = generate(m.mapTypeId, m.mapSeed, m.params ?? {})
    } catch {
      gm = null
    }
    const voronoi = new Map<string, string>()
    if (gm && gm.areas.length >= 2) {
      const points: number[] = []
      for (const a of gm.areas) {
        points.push(a.shape.x + a.shape.w / 2)
        points.push(a.shape.y + a.shape.h / 2)
      }
      const delaunay = new Delaunay(Float64Array.from(points))
      const v = delaunay.voronoi([0, 0, VIEW_W, VIEW_H])
      for (let i = 0; i < gm.areas.length; i++) {
        const cell = v.cellPolygon(i)
        if (!cell) continue
        const pts = cell.slice(0, -1)
          .map(([x, y]) => `${(x * SCALE_X).toFixed(1)},${(y * SCALE_Y).toFixed(1)}`)
          .join(' ')
        voronoi.set(gm.areas[i]!.id, pts)
      }
    }
    const visitedAreaIds = new Set(
      party.visitedAreas.filter(v => v.mapId === m.id).map(v => v.areaId)
    )
    const fullyFogged = !isMaster.value && visitedAreaIds.size === 0
    return { map: m, generated: gm, voronoi, visitedAreaIds, fullyFogged }
  })
})

interface MiniLink {
  fromTileIdx: number
  toTileIdx: number
  fromAreaId: string
  toAreaId: string
}

const links = computed<MiniLink[]>(() => {
  const idxByMap = new Map<string, number>()
  party.maps.forEach((m, i) => idxByMap.set(m.id, i))
  const seen = new Set<string>()
  const out: MiniLink[] = []
  for (const t of party.transitions) {
    const fromIdx = idxByMap.get(t.fromMapId)
    const toIdx = idxByMap.get(t.toMapId)
    if (fromIdx === undefined || toIdx === undefined) continue
    // Mostra solo le transitions tra mappe già esplorate (per non rivelare
    // mappe nascoste in fog ai non-master).
    if (!isMaster.value) {
      const fromTile = tiles.value[fromIdx]
      const toTile = tiles.value[toIdx]
      if (!fromTile || !toTile) continue
      if (fromTile.fullyFogged || toTile.fullyFogged) continue
    }
    const key = [t.fromMapId, t.toMapId].sort().join('::')
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      fromTileIdx: fromIdx,
      toTileIdx: toIdx,
      fromAreaId: t.fromAreaId,
      toAreaId: t.toAreaId
    })
  }
  return out
})

function tilePos(idx: number): { x: number, y: number } {
  const cols = 3
  const col = idx % cols
  const row = Math.floor(idx / cols)
  const padding = 32
  return {
    x: padding + col * (TILE_W + padding),
    y: padding + row * (TILE_H + padding + 32) // +32 per la label
  }
}

function tileCenter(idx: number): { x: number, y: number } {
  const p = tilePos(idx)
  return { x: p.x + TILE_W / 2, y: p.y + TILE_H / 2 }
}

const totalRows = computed(() => Math.ceil(party.maps.length / 3))
const svgW = computed(() => 32 + 3 * (TILE_W + 32))
const svgH = computed(() => 32 + totalRows.value * (TILE_H + 32 + 32) + 16)

function fillForArea(tile: Tile, areaId: string, fogged: boolean): string {
  if (fogged && !tile.visitedAreaIds.has(areaId)) return '#0a0a0a'
  return '#1a2a1f'
}

function strokeForArea(tile: Tile, areaId: string, fogged: boolean): string {
  if (fogged && !tile.visitedAreaIds.has(areaId)) return '#202020'
  return '#3a5a3a'
}

function selectTile(idx: number) {
  const tile = tiles.value[idx]
  if (!tile) return
  if (tile.fullyFogged) return // niente click su mappa fog
  // Per ora: torna alla map view. Se la mappa cliccata è diversa dalla
  // currentMapId del player, in futuro implementeremo il "view-only"
  // (guardare una mappa altra senza spostarsi). Master può teleport
  // tramite cross-map move WS direttamente dalla normale MapView.
  viewStore.backToMap()
}
</script>

<template>
  <section
    class="w-full flex-1 min-h-0 overflow-auto"
    style="background: var(--z-bg-900)"
  >
    <header
      class="px-4 py-3 flex items-center justify-between sticky top-0 z-10"
      style="background: var(--z-bg-900); border-bottom: 1px solid var(--z-border)"
    >
      <div>
        <h2
          class="text-sm font-semibold"
          style="color: var(--z-text-hi)"
        >
          🌐 Mondo
        </h2>
        <p
          class="text-xs font-mono-z"
          style="color: var(--z-text-md)"
        >
          {{ party.maps.length }} mappe ·
          {{ isMaster ? 'visione master (no fog)' : 'mappe esplorate dalla party' }}
        </p>
      </div>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        @click="viewStore.backToMap()"
      >
        Torna alla mappa
      </UButton>
    </header>

    <div class="p-4">
      <svg
        :viewBox="`0 0 ${svgW} ${svgH}`"
        :style="`width: ${svgW}px; height: ${svgH}px; max-width: 100%`"
      >
        <!-- Linee transition tra tile -->
        <g pointer-events="none">
          <line
            v-for="l in links"
            :key="`link-${l.fromTileIdx}-${l.toTileIdx}`"
            :x1="tileCenter(l.fromTileIdx).x"
            :y1="tileCenter(l.fromTileIdx).y"
            :x2="tileCenter(l.toTileIdx).x"
            :y2="tileCenter(l.toTileIdx).y"
            stroke="var(--z-rust-300)"
            stroke-width="2"
            stroke-dasharray="6 4"
            opacity="0.5"
          />
        </g>

        <!-- Tile delle mappe -->
        <g
          v-for="(tile, idx) in tiles"
          :key="tile.map.id"
          :transform="`translate(${tilePos(idx).x}, ${tilePos(idx).y})`"
          :style="tile.fullyFogged ? 'cursor: not-allowed' : 'cursor: pointer'"
          @click="selectTile(idx)"
        >
          <!-- Cornice tile -->
          <rect
            :width="TILE_W"
            :height="TILE_H"
            rx="6"
            ry="6"
            :fill="tile.fullyFogged ? '#050505' : 'var(--z-bg-800)'"
            :stroke="tile.map.isSpawn ? 'var(--z-blood-300)' : 'var(--z-border)'"
            :stroke-width="tile.map.isSpawn ? 2 : 1"
          />

          <!-- Voronoi miniature (solo se mappa esplorata) -->
          <g v-if="!tile.fullyFogged && tile.generated">
            <polygon
              v-for="a in tile.generated.areas"
              :key="a.id"
              :points="tile.voronoi.get(a.id) ?? ''"
              :fill="fillForArea(tile, a.id, !isMaster)"
              :stroke="strokeForArea(tile, a.id, !isMaster)"
              stroke-width="0.6"
              stroke-linejoin="round"
            />
          </g>
          <!-- Fog totale -->
          <g v-else>
            <rect
              :width="TILE_W"
              :height="TILE_H"
              rx="6"
              ry="6"
              fill="url(#area-fog-mini)"
              opacity="0.6"
            />
            <text
              :x="TILE_W / 2"
              :y="TILE_H / 2 + 8"
              text-anchor="middle"
              font-size="32"
              font-weight="700"
              fill="#3a3a3a"
            >?</text>
          </g>

          <!-- Label tile esterna sotto -->
          <g :transform="`translate(0, ${TILE_H + 6})`">
            <text
              :x="TILE_W / 2"
              y="14"
              text-anchor="middle"
              font-size="13"
              font-weight="700"
              :fill="tile.fullyFogged ? 'var(--z-text-lo)' : 'var(--z-text-hi)'"
            >
              {{ tile.fullyFogged ? '???' : tile.map.name }}
            </text>
            <text
              :x="TILE_W / 2"
              y="28"
              text-anchor="middle"
              font-size="10"
              fill="var(--z-text-md)"
              font-family="monospace"
            >
              {{ tile.fullyFogged ? '— mappa non esplorata —' : `tipo: ${tile.map.mapTypeId}${tile.map.isSpawn ? ' · spawn' : ''}` }}
            </text>
          </g>
        </g>

        <defs>
          <pattern
            id="area-fog-mini"
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
        </defs>
      </svg>
    </div>
  </section>
</template>
