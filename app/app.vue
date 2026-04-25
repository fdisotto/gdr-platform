<script setup lang="ts">
import FeedbackToaster from '~/components/layout/FeedbackToaster.vue'
import PartyTabBar from '~/components/layout/PartyTabBar.vue'

useHead({
  htmlAttrs: {
    lang: 'it',
    class: 'dark'
  },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' }
  ]
})

useSeoMeta({
  title: 'GDR Zombi',
  description: 'Piattaforma per giocare di ruolo in un mondo infestato dai morti.'
})
</script>

<template>
  <UApp>
    <div class="flex flex-col h-screen overflow-hidden">
      <PartyTabBar />
      <div class="flex-1 min-h-0 flex flex-col overflow-y-auto">
        <NuxtPage />
      </div>
    </div>
    <FeedbackToaster />
  </UApp>
</template>
