<script setup lang="ts">
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import MapView from '~/components/map/MapView.vue'
import { useViewStore } from '~/stores/view'

const route = useRoute()
const seed = String(route.params.seed)
const viewStore = useViewStore(seed)
onMounted(() => viewStore.show('map'))
</script>

<template>
  <MapView />
</template>
