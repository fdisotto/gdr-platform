<script setup lang="ts">
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
    <NuxtPage />
  </UApp>
</template>
