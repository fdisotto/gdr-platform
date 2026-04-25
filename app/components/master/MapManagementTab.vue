<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import CreateMapModal from '~/components/master/CreateMapModal.vue'
import TransitionsModal from '~/components/master/TransitionsModal.vue'

// v2d: pannello master per gestire le mappe della party.
// La lista mappe è caricata via $fetch su `/api/parties/:seed/maps` per
// garantire dati aggiornati sui conteggi (members, zombies). Lo store
// `partyStore.maps` dipende dal payload state:init via WS e potrebbe avere
// lag rispetto a una creazione/eliminazione appena fatta.

interface MapRow {
  id: string
  partySeed: string
  mapTypeId: string
  mapSeed: string
  name: string
  isSpawn: boolean
  createdAt: number
  memberCount: number
  zombieCount: number
}

const seed = usePartySeed()
const feedback = useFeedbackStore()
const err = useErrorFeedback()

const maps = ref<MapRow[]>([])
const loading = ref(false)
const showCreate = ref(false)
const showTransitions = ref<MapRow | null>(null)

async function refresh() {
  loading.value = true
  try {
    maps.value = await $fetch<MapRow[]>(`/api/parties/${seed}/maps`)
  } catch (e) {
    err.reportFromError(e)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function setSpawn(map: MapRow) {
  try {
    await $fetch(`/api/parties/${seed}/maps/${map.id}/set-spawn`, { method: 'POST' })
    feedback.pushToast({ level: 'info', title: `Spawn impostato: ${map.name}` })
    await refresh()
  } catch (e) {
    err.reportFromError(e)
  }
}

async function deleteMap(map: MapRow) {
  if (!confirm(`Eliminare la mappa "${map.name}"?`)) return
  try {
    await $fetch(`/api/parties/${seed}/maps/${map.id}`, { method: 'DELETE' })
    feedback.pushToast({ level: 'info', title: 'Mappa eliminata' })
    await refresh()
  } catch (e) {
    err.reportFromError(e)
  }
}

function openTransitions(map: MapRow) {
  showTransitions.value = map
}

function onCreated() {
  showCreate.value = false
  refresh()
}
</script>

<template>
  <div class="space-y-3">
    <div class="flex items-center justify-between">
      <h3
        class="text-sm font-semibold"
        style="color: var(--z-text-hi)"
      >
        Mappe della party
      </h3>
      <UButton
        size="xs"
        variant="soft"
        color="primary"
        :loading="loading"
        @click="refresh"
      >
        Aggiorna
      </UButton>
    </div>

    <p
      v-if="loading"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Caricamento…
    </p>
    <div
      v-else-if="maps.length === 0"
      class="text-xs italic"
      style="color: var(--z-text-lo)"
    >
      Nessuna mappa.
    </div>
    <div
      v-else
      class="space-y-2"
    >
      <div
        v-for="m in maps"
        :key="m.id"
        class="p-3 rounded flex items-center justify-between gap-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span
              class="text-sm font-mono-z truncate"
              style="color: var(--z-text-hi)"
            >
              {{ m.name }}
            </span>
            <span
              v-if="m.isSpawn"
              class="text-xs px-1.5 py-0.5 rounded"
              style="background: var(--z-blood-700); color: var(--z-blood-300)"
            >
              spawn
            </span>
          </div>
          <p
            class="text-xs mt-0.5 font-mono-z"
            style="color: var(--z-text-md)"
          >
            tipo: {{ m.mapTypeId }} · membri: {{ m.memberCount }} · zombi: {{ m.zombieCount }}
          </p>
        </div>
        <div class="flex gap-1.5">
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            :disabled="m.isSpawn"
            @click="setSpawn(m)"
          >
            Spawn
          </UButton>
          <UButton
            size="xs"
            variant="soft"
            color="neutral"
            @click="openTransitions(m)"
          >
            Porte
          </UButton>
          <UButton
            size="xs"
            variant="soft"
            color="error"
            :disabled="m.isSpawn"
            @click="deleteMap(m)"
          >
            Elimina
          </UButton>
        </div>
      </div>
    </div>

    <UButton
      size="sm"
      variant="solid"
      color="primary"
      block
      @click="showCreate = true"
    >
      Crea nuova mappa
    </UButton>

    <CreateMapModal
      v-if="showCreate"
      @close="showCreate = false"
      @created="onCreated"
    />

    <TransitionsModal
      v-if="showTransitions"
      :map="showTransitions"
      @close="showTransitions = null"
    />
  </div>
</template>
