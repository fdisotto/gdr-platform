<script setup lang="ts">
import { computed } from 'vue'
import GameMap from '~/components/map/GameMap.vue'
import { useGeneratedMap } from '~/composables/useGeneratedMap'
import type { PartyMapPublic } from '~~/shared/protocol/ws'

// T20: il render SVG consuma una GeneratedMap deterministica derivata da
// (mapTypeId, mapSeed, params) della mappa attiva. Usa lo stesso generator
// del server (cache process-locale → no recompute a parità di input).
const props = defineProps<{
  map: PartyMapPublic | null
}>()

const mapTypeId = computed<string | null>(() => props.map?.mapTypeId ?? null)
const mapSeed = computed<string | null>(() => props.map?.mapSeed ?? null)
const params = computed<Record<string, unknown>>(() => props.map?.params ?? {})

const generatedMap = useGeneratedMap(mapTypeId, mapSeed, params)
</script>

<template>
  <GameMap :generated-map="generatedMap" />
</template>
