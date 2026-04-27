<script setup lang="ts">
// Sprite SVG primitivi (alberi, edifici, auto, macerie, casse, lampioni,
// fuochi) usati sia nel dettaglio area (AreaDetailView, scala grande)
// sia nella mappa principale (MapDecor, scala piccola dentro le celle).
// Tutti i kind condividono il sistema di coord locale: scaling/rotazione
// applicati dal caller via `transform`.
type DecorKind = 'tree' | 'building' | 'car' | 'rubble' | 'crate' | 'lamp' | 'fire'
defineProps<{ kind: DecorKind }>()
</script>

<template>
  <g>
    <!-- Tree: chioma + macchie più chiare -->
    <g v-if="kind === 'tree'">
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

    <!-- Building: blocco rettangolare con finestre illuminate -->
    <g v-else-if="kind === 'building'">
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

    <!-- Car: chassis + tetto + ruote -->
    <g v-else-if="kind === 'car'">
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

    <!-- Rubble: poligoni irregolari sovrapposti -->
    <g v-else-if="kind === 'rubble'">
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

    <!-- Crate: cassa di legno con assi -->
    <g v-else-if="kind === 'crate'">
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

    <!-- Lamp: alone luminoso + palo + lampada -->
    <g v-else-if="kind === 'lamp'">
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

    <!-- Fire: brace + fiamme stratificate -->
    <g v-else-if="kind === 'fire'">
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
</template>
