<script setup lang="ts">
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import WorldMapView from '~/components/map/WorldMapView.vue'
import { useViewStore } from '~/stores/view'

const route = useRoute()
const seed = String(route.params.seed)
const viewStore = useViewStore(seed)
onMounted(() => viewStore.show('world'))
</script>

<template>
  <WorldMapView />
</template>
