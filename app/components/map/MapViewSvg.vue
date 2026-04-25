<script setup lang="ts">
import GameMap from '~/components/map/GameMap.vue'
import type { PartyMapPublic } from '~~/shared/protocol/ws'

// T19 placeholder: deleghiamo al GameMap esistente per non rompere il
// rendering attuale. T20 sostituirà questo wrapper con il porting reale
// SVG basato sul generator deterministico.
defineProps<{
  map: PartyMapPublic | null
}>()
</script>

<template>
  <GameMap />
</template>
