<script setup lang="ts">
import MapViewSvg from '~/components/map/MapViewSvg.vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { usePartyMaps } from '~/composables/usePartyMaps'

// Render engine: solo SVG. In futuro qui tornerà uno switch quando
// aggiungeremo altri engine (canvas/webgl/leaflet/...).
const seed = usePartySeed()
const { activeMap } = usePartyMaps(seed)
</script>

<template>
  <MapViewSvg :map="activeMap" />
</template>
