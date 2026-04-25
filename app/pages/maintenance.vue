<script setup lang="ts">
import { onMounted, ref } from 'vue'

useSeoMeta({ title: 'GDR Zombi — Manutenzione' })

const message = ref('Manutenzione in corso. Torniamo presto.')

async function load() {
  try {
    const res = await $fetch<{ maintenanceMessage: string, maintenanceMode: boolean }>('/api/system/status')
    message.value = res.maintenanceMessage || 'Manutenzione in corso. Torniamo presto.'
    if (!res.maintenanceMode) {
      // Stato di manutenzione rientrato: il middleware non bloccherà più,
      // riportiamo l'utente in home alla prossima nav.
      await navigateTo('/', { replace: true })
    }
  } catch {
    // ignora; il default rimane
  }
}

onMounted(load)
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-md space-y-6 text-center">
      <h1
        class="text-3xl font-bold tracking-tight"
        style="color: var(--z-rust-300)"
      >
        Manutenzione in corso
      </h1>
      <p
        class="text-sm whitespace-pre-line"
        style="color: var(--z-text-md)"
      >
        {{ message }}
      </p>
      <NuxtLink
        to="/admin/login"
        class="block text-xs"
        style="color: var(--z-blood-300); text-decoration: underline"
      >
        Pannello admin →
      </NuxtLink>
    </div>
  </main>
</template>
