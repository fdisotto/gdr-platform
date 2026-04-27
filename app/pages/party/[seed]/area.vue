<script setup lang="ts">
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import AreaDetailView from '~/components/map/AreaDetailView.vue'
import { useViewStore } from '~/stores/view'

const route = useRoute()
const seed = String(route.params.seed)
const viewStore = useViewStore(seed)
onMounted(() => viewStore.show('area'))
</script>

<template>
  <AreaDetailView />
</template>
