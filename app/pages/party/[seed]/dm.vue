<script setup lang="ts">
import { useRoute } from 'vue-router'
import { onMounted } from 'vue'
import DirectMessagesView from '~/components/dm/DirectMessagesView.vue'
import { useViewStore } from '~/stores/view'

const route = useRoute()
const seed = String(route.params.seed)
const viewStore = useViewStore(seed)
onMounted(() => viewStore.show('dm'))
</script>

<template>
  <DirectMessagesView />
</template>
