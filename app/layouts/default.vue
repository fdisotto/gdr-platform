<script setup lang="ts">
import PartyTabBar from '~/components/layout/PartyTabBar.vue'
</script>

<template>
  <div class="flex flex-col h-screen overflow-hidden">
    <PartyTabBar />
    <div class="flex-1 min-h-0 flex flex-col overflow-y-auto">
      <slot />
    </div>
  </div>
</template>
