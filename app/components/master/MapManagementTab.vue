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

const renamingMapId = ref<string | null>(null)
const renameDraft = ref('')
function startRename(map: MapRow) {
  renamingMapId.value = map.id
  renameDraft.value = map.name
}
function cancelRename() {
  renamingMapId.value = null
  renameDraft.value = ''
}
async function commitRename() {
  if (!renamingMapId.value) return
  const name = renameDraft.value.trim().slice(0, 64)
  if (!name) {
    cancelRename()
    return
  }
  try {
    await $fetch(`/api/parties/${seed}/maps/${renamingMapId.value}/rename`, {
      method: 'POST',
      body: { name }
    })
    feedback.pushToast({ level: 'info', title: `Mappa rinominata: ${name}` })
    cancelRename()
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
  <div class="space-y-6">
    <!-- ── Mappe della party ─────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">🗺</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-green-300)"
        >
          Mappe
        </h3>
        <span
          class="text-xs"
          style="color: var(--z-text-lo)"
        >zone, spawn, transizioni</span>
        <div class="ml-auto">
          <UButton
            size="xs"
            variant="ghost"
            color="neutral"
            icon="i-lucide-refresh-cw"
            :loading="loading"
            @click="refresh"
          />
        </div>
      </header>

      <p
        v-if="loading"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Caricamento…
      </p>
      <p
        v-else-if="maps.length === 0"
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Nessuna mappa.
      </p>
      <ul
        v-else
        class="space-y-2"
      >
        <li
          v-for="m in maps"
          :key="m.id"
          class="p-3 rounded flex items-center justify-between gap-3"
          style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        >
          <div class="flex-1 min-w-0">
            <div
              v-if="renamingMapId === m.id"
              class="flex items-center gap-1.5"
            >
              <input
                v-model="renameDraft"
                type="text"
                maxlength="64"
                class="flex-1 px-2 py-1 rounded text-sm font-mono-z"
                style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
                autofocus
                @keyup.enter="commitRename"
                @keyup.escape="cancelRename"
              >
              <UButton
                size="xs"
                color="primary"
                @click="commitRename"
              >
                Salva
              </UButton>
              <UButton
                size="xs"
                variant="ghost"
                color="neutral"
                @click="cancelRename"
              >
                ×
              </UButton>
            </div>
            <template v-else>
              <div class="flex items-center gap-2">
                <span
                  class="text-sm font-mono-z truncate"
                  style="color: var(--z-text-hi)"
                >
                  {{ m.name }}
                </span>
                <span
                  v-if="m.isSpawn"
                  class="text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded"
                  style="background: var(--z-blood-700); color: var(--z-blood-300)"
                >
                  spawn
                </span>
              </div>
              <p
                class="text-xs mt-0.5 font-mono-z"
                style="color: var(--z-text-md)"
              >
                {{ m.mapTypeId }} · {{ m.memberCount }} membri · {{ m.zombieCount }} zombi
              </p>
            </template>
          </div>
          <div
            v-if="renamingMapId !== m.id"
            class="flex gap-1.5 shrink-0"
          >
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-pencil"
              title="Rinomina mappa"
              @click="startRename(m)"
            />
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              :disabled="m.isSpawn"
              title="Imposta come mappa di spawn"
              @click="setSpawn(m)"
            >
              Spawn
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              title="Gestisci porte/transizioni"
              @click="openTransitions(m)"
            >
              Porte
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="error"
              :disabled="m.isSpawn"
              title="Elimina mappa"
              @click="deleteMap(m)"
            >
              ×
            </UButton>
          </div>
        </li>
      </ul>

      <UButton
        size="sm"
        variant="solid"
        color="primary"
        class="mt-3"
        block
        icon="i-lucide-plus"
        @click="showCreate = true"
      >
        Crea nuova mappa
      </UButton>
    </section>

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
