<script setup lang="ts">
import NicknameForm from '~/components/home/NicknameForm.vue'
import SessionsList from '~/components/home/SessionsList.vue'
import CreatePartyForm from '~/components/home/CreatePartyForm.vue'
import JoinPartyForm from '~/components/home/JoinPartyForm.vue'

useSeoMeta({ title: 'GDR Zombi — Benvenuto' })
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-xl space-y-8">
      <header class="text-center space-y-2">
        <h1
          class="text-4xl font-bold tracking-tight"
          style="color: var(--z-green-300)"
        >
          GDR Zombi
        </h1>
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          La città non è più quella che ricordi.
        </p>
      </header>

      <NicknameForm />

      <SessionsList />

      <section
        class="space-y-3 pt-4"
        style="border-top: 1px solid var(--z-border)"
      >
        <CreatePartyForm />
      </section>

      <section
        class="space-y-3 pt-4"
        style="border-top: 1px solid var(--z-border)"
      >
        <h2
          class="text-sm uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Oppure unisciti a una esistente
        </h2>
        <JoinPartyForm />
      </section>
    </div>
  </main>
</template>
