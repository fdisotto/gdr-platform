<script setup lang="ts">
import { ref } from 'vue'

const open = ref(false)

const ITEMS: { status: 'intact' | 'infested' | 'ruined' | 'closed', label: string, description: string }[] = [
  { status: 'intact', label: 'Intatta', description: 'Area agibile, niente infestazione' },
  { status: 'infested', label: 'Infestata', description: 'Zombi presenti' },
  { status: 'ruined', label: 'In rovina', description: 'Crolli, detriti' },
  { status: 'closed', label: 'Chiusa', description: 'Sbarrata, ingresso negato' }
]

// v2d-roads: tipi di strada visualizzati nelle mappe multi-mappa.
type RoadKind = 'urban' | 'path' | 'wasteland' | 'highway' | 'bridge'
const ROADS: { kind: RoadKind, label: string, description: string }[] = [
  { kind: 'urban', label: 'Asfalto', description: 'Strada cittadina a una corsia' },
  { kind: 'path', label: 'Sentiero', description: 'Sterrato, zone rurali' },
  { kind: 'wasteland', label: 'Crepata', description: 'Asfalto rovinato post-disastro' },
  { kind: 'highway', label: 'Autostrada', description: 'Doppia corsia con bordi gialli' },
  { kind: 'bridge', label: 'Ponte', description: 'Passerella sopra acqua' }
]
</script>

<template>
  <div
    class="absolute bottom-3 left-3 rounded-md text-xs"
    style="background: var(--z-bg-800); border: 1px solid var(--z-border); max-width: 220px"
  >
    <button
      type="button"
      class="w-full flex items-center justify-between px-3 py-2"
      style="color: var(--z-text-md)"
      @click="open = !open"
    >
      <span class="uppercase tracking-wide">Legenda</span>
      <span style="color: var(--z-text-lo)">{{ open ? '▾' : '▸' }}</span>
    </button>
    <ul
      v-if="open"
      class="px-3 pb-2 space-y-1.5"
      style="border-top: 1px solid var(--z-border); padding-top: 6px; max-height: 60vh; overflow-y: auto"
    >
      <li
        v-for="i in ITEMS"
        :key="i.status"
        class="flex items-start gap-2"
      >
        <svg
          width="24"
          height="18"
          viewBox="0 0 24 18"
          style="flex-shrink: 0; margin-top: 2px"
        >
          <defs>
            <pattern
              id="legend-infested"
              width="4"
              height="4"
              patternUnits="userSpaceOnUse"
              patternTransform="rotate(45)"
            >
              <line
                x1="0"
                y1="0"
                x2="0"
                y2="4"
                stroke="var(--z-green-500)"
                stroke-width="0.8"
              />
            </pattern>
            <pattern
              id="legend-ruined"
              width="8"
              height="8"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M 0 4 L 8 1 M 1 8 L 5 0 M 4 8 L 8 6"
                stroke="var(--z-text-lo)"
                stroke-width="0.5"
                fill="none"
              />
            </pattern>
          </defs>
          <rect
            x="1"
            y="1"
            width="22"
            height="16"
            rx="3"
            fill="var(--z-bg-700)"
            stroke="var(--z-green-700)"
            stroke-width="1"
            :opacity="i.status === 'ruined' ? 0.65 : i.status === 'closed' ? 0.5 : 1"
          />
          <rect
            v-if="i.status === 'infested'"
            x="1"
            y="1"
            width="22"
            height="16"
            rx="3"
            fill="url(#legend-infested)"
            opacity="0.7"
          />
          <rect
            v-if="i.status === 'ruined'"
            x="1"
            y="1"
            width="22"
            height="16"
            rx="3"
            fill="url(#legend-ruined)"
            opacity="0.5"
          />
          <g
            v-if="i.status === 'closed'"
            transform="translate(9, 6)"
          >
            <rect
              x="0"
              y="2"
              width="6"
              height="4"
              rx="0.5"
              fill="var(--z-text-lo)"
            />
            <path
              d="M 1.5 2 L 1.5 1 A 1.5 1.5 0 0 1 4.5 1 L 4.5 2"
              stroke="var(--z-text-lo)"
              stroke-width="0.7"
              fill="none"
            />
          </g>
        </svg>
        <div class="flex-1 leading-tight">
          <div
            class="font-semibold"
            style="color: var(--z-text-hi)"
          >
            {{ i.label }}
          </div>
          <div style="color: var(--z-text-lo); font-size: 0.72rem">
            {{ i.description }}
          </div>
        </div>
      </li>

      <!-- v2d-roads: tipi di strada -->
      <li
        class="pt-1 pb-1"
        style="border-top: 1px solid var(--z-border); margin-top: 4px"
      >
        <div
          class="uppercase tracking-wide"
          style="color: var(--z-text-md); font-size: 0.7rem"
        >
          Strade
        </div>
      </li>
      <li
        v-for="r in ROADS"
        :key="r.kind"
        class="flex items-start gap-2"
      >
        <svg
          width="40"
          height="14"
          viewBox="0 0 40 14"
          style="flex-shrink: 0; margin-top: 2px"
        >
          <!-- urban -->
          <g v-if="r.kind === 'urban'">
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#1a1e1b"
              stroke-width="9"
              stroke-linecap="round"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#2a2f2c"
              stroke-width="6"
              stroke-linecap="round"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#cfcabf"
              stroke-width="0.7"
              stroke-dasharray="4 5"
              opacity="0.6"
            />
          </g>
          <!-- path -->
          <g v-if="r.kind === 'path'">
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#3b3023"
              stroke-width="8"
              stroke-linecap="round"
              opacity="0.85"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#7a6648"
              stroke-width="4"
              stroke-dasharray="8 4"
              stroke-linecap="round"
            />
          </g>
          <!-- wasteland -->
          <g v-if="r.kind === 'wasteland'">
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#1c1612"
              stroke-width="9"
              stroke-linecap="round"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#5b3e2c"
              stroke-width="5"
              stroke-dasharray="14 3 3 3"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#a04432"
              stroke-width="0.7"
              stroke-dasharray="2 9"
              opacity="0.7"
            />
          </g>
          <!-- highway -->
          <g v-if="r.kind === 'highway'">
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#0e1110"
              stroke-width="12"
              stroke-linecap="round"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#e6c34d"
              stroke-width="11"
              opacity="0.55"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#3a3f3c"
              stroke-width="9"
              stroke-linecap="round"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#ffffff"
              stroke-width="0.7"
              stroke-dasharray="6 4"
              opacity="0.7"
            />
          </g>
          <!-- bridge -->
          <g v-if="r.kind === 'bridge'">
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#22507a"
              stroke-width="11"
              opacity="0.6"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#7c5a3a"
              stroke-width="7"
            />
            <line
              x1="0"
              y1="7"
              x2="40"
              y2="7"
              stroke="#3a2a1a"
              stroke-width="0.8"
              stroke-dasharray="2 3"
              opacity="0.85"
            />
          </g>
        </svg>
        <div class="flex-1 leading-tight">
          <div
            class="font-semibold"
            style="color: var(--z-text-hi)"
          >
            {{ r.label }}
          </div>
          <div style="color: var(--z-text-lo); font-size: 0.72rem">
            {{ r.description }}
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
