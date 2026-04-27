<script setup lang="ts">
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import MasterPanel from '~/components/master/MasterPanel.vue'
import { useViewStore } from '~/stores/view'

const route = useRoute()
const seed = String(route.params.seed)
const viewStore = useViewStore(seed)
onMounted(() => viewStore.show('master'))
</script>

<template>
  <MasterPanel />
</template>
