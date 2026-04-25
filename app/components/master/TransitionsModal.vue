<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { generate } from '~~/shared/map/generators'
import type { GeneratedArea } from '~~/shared/map/generators/types'

// v2d: modale per gestire le porte (transitions) di una mappa.
// Mostra outgoing/incoming e permette di crearne di nuove scegliendo:
// area sorgente nella mappa corrente, mappa di destinazione, area target.
// Le aree sono ricavate dal generator condiviso (deterministico) per non
// dover esporre via API la lista completa per ogni mappa.

interface MapRow {
  id: string
  mapTypeId: string
  mapSeed: string
  name: string
  isSpawn: boolean
  createdAt: number
}

interface TransitionRow {
  id: string
  fromMapId: string
  fromAreaId: string
  toMapId: string
  toAreaId: string
  label: string | null
  createdAt: number
}

const props = defineProps<{ map: MapRow & { params?: Record<string, unknown> } }>()
const emit = defineEmits<{ (e: 'close'): void }>()
const seed = usePartySeed()
const err = useErrorFeedback()

const allMaps = ref<MapRow[]>([])
const transitions = ref<{ outgoing: TransitionRow[], incoming: TransitionRow[] }>({ outgoing: [], incoming: [] })
const loading = ref(false)
const showAdd = ref(false)
const newToMapId = ref('')
const newFromAreaId = ref('')
const newToAreaId = ref('')
const newLabel = ref('')
const newBidir = ref(true)
const submitting = ref(false)

const fromMapAreas = computed<GeneratedArea[]>(() => {
  try {
    const gm = generate(props.map.mapTypeId, props.map.mapSeed, props.map.params ?? {})
    return gm.areas
  } catch {
    return []
  }
})

const toMap = computed<MapRow | null>(() =>
  allMaps.value.find(m => m.id === newToMapId.value) ?? null
)

const toMapAreas = computed<GeneratedArea[]>(() => {
  if (!toMap.value) return []
  try {
    const gm = generate(toMap.value.mapTypeId, toMap.value.mapSeed, {})
    return gm.areas
  } catch {
    return []
  }
})

async function refresh() {
  loading.value = true
  try {
    const [mapsRes, transRes] = await Promise.all([
      $fetch<MapRow[]>(`/api/parties/${seed}/maps`),
      $fetch<typeof transitions.value>(`/api/parties/${seed}/maps/${props.map.id}/transitions`)
    ])
    allMaps.value = mapsRes.filter(m => m.id !== props.map.id)
    transitions.value = transRes
  } catch (e) {
    err.reportFromError(e)
  } finally {
    loading.value = false
  }
}

onMounted(refresh)

async function addTransition() {
  if (!newToMapId.value || !newFromAreaId.value || !newToAreaId.value) return
  submitting.value = true
  try {
    await $fetch(`/api/parties/${seed}/maps/${props.map.id}/transitions`, {
      method: 'POST',
      body: {
        fromAreaId: newFromAreaId.value,
        toMapId: newToMapId.value,
        toAreaId: newToAreaId.value,
        label: newLabel.value.trim() || undefined,
        bidirectional: newBidir.value
      }
    })
    showAdd.value = false
    newToMapId.value = ''
    newFromAreaId.value = ''
    newToAreaId.value = ''
    newLabel.value = ''
    await refresh()
  } catch (e) {
    err.reportFromError(e)
  } finally {
    submitting.value = false
  }
}

async function deleteTransition(t: TransitionRow) {
  if (!confirm('Eliminare questa porta?')) return
  try {
    await $fetch(`/api/parties/${seed}/maps/${t.fromMapId}/transitions/${t.id}`, { method: 'DELETE' })
    await refresh()
  } catch (e) {
    err.reportFromError(e)
  }
}
</script>

<template>
  <UModal
    :open="true"
    @update:open="(v: boolean) => !v && emit('close')"
  >
    <template #content>
      <div
        class="p-4 space-y-3"
        style="background: var(--z-bg-800); border-radius: 6px"
      >
        <div class="flex items-center justify-between">
          <h3
            class="text-sm font-semibold"
            style="color: var(--z-text-hi)"
          >
            Porte di "{{ map.name }}"
          </h3>
          <UButton
            size="xs"
            variant="ghost"
            @click="emit('close')"
          >
            ×
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
          v-else
          class="space-y-3"
        >
          <div>
            <h4
              class="text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >
              In uscita
            </h4>
            <ul
              v-if="transitions.outgoing.length"
              class="space-y-1"
            >
              <li
                v-for="t in transitions.outgoing"
                :key="t.id"
                class="px-2 py-1.5 text-xs font-mono-z flex items-center justify-between"
                style="background: var(--z-bg-900); border-radius: 4px; color: var(--z-text-md)"
              >
                <span>
                  {{ t.fromAreaId }} → {{ t.toAreaId }}
                  <span v-if="t.label">({{ t.label }})</span>
                </span>
                <UButton
                  size="xs"
                  variant="ghost"
                  color="error"
                  @click="deleteTransition(t)"
                >
                  ×
                </UButton>
              </li>
            </ul>
            <p
              v-else
              class="text-xs italic"
              style="color: var(--z-text-lo)"
            >
              Nessuna.
            </p>
          </div>
          <div>
            <h4
              class="text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >
              In entrata
            </h4>
            <ul
              v-if="transitions.incoming.length"
              class="space-y-1"
            >
              <li
                v-for="t in transitions.incoming"
                :key="t.id"
                class="px-2 py-1.5 text-xs font-mono-z"
                style="background: var(--z-bg-900); border-radius: 4px; color: var(--z-text-md)"
              >
                ← {{ t.fromAreaId }} (da {{ t.fromMapId.slice(0, 8) }})
              </li>
            </ul>
            <p
              v-else
              class="text-xs italic"
              style="color: var(--z-text-lo)"
            >
              Nessuna.
            </p>
          </div>

          <div v-if="!showAdd">
            <UButton
              size="xs"
              variant="soft"
              color="primary"
              block
              @click="showAdd = true"
            >
              Aggiungi porta
            </UButton>
          </div>
          <div
            v-else
            class="space-y-2 p-2 rounded"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border)"
          >
            <label
              class="block text-xs"
              style="color: var(--z-text-md)"
            >
              Da quest'area
              <select
                v-model="newFromAreaId"
                class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
                style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
              >
                <option value="">
                  Seleziona…
                </option>
                <option
                  v-for="a in fromMapAreas"
                  :key="a.id"
                  :value="a.id"
                >
                  {{ a.name }} {{ a.edge ? '(edge)' : '' }}
                </option>
              </select>
            </label>
            <label
              class="block text-xs"
              style="color: var(--z-text-md)"
            >
              Mappa di destinazione
              <select
                v-model="newToMapId"
                class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
                style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
              >
                <option value="">
                  Seleziona…
                </option>
                <option
                  v-for="m in allMaps"
                  :key="m.id"
                  :value="m.id"
                >
                  {{ m.name }} ({{ m.mapTypeId }})
                </option>
              </select>
            </label>
            <label
              v-if="newToMapId"
              class="block text-xs"
              style="color: var(--z-text-md)"
            >
              Area in mappa di destinazione
              <select
                v-model="newToAreaId"
                class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
                style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
              >
                <option value="">
                  Seleziona…
                </option>
                <option
                  v-for="a in toMapAreas"
                  :key="a.id"
                  :value="a.id"
                >
                  {{ a.name }} {{ a.edge ? '(edge)' : '' }}
                </option>
              </select>
            </label>
            <label
              class="block text-xs"
              style="color: var(--z-text-md)"
            >
              Etichetta (opz.)
              <input
                v-model="newLabel"
                type="text"
                maxlength="64"
                placeholder="es. Ponte"
                class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
                style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
              >
            </label>
            <label
              class="flex items-center gap-2 text-xs"
              style="color: var(--z-text-md)"
            >
              <input
                v-model="newBidir"
                type="checkbox"
              >
              Bidirezionale
            </label>
            <div class="flex gap-2 justify-end pt-1">
              <UButton
                size="xs"
                variant="ghost"
                @click="showAdd = false"
              >
                Annulla
              </UButton>
              <UButton
                size="xs"
                variant="solid"
                color="primary"
                :loading="submitting"
                :disabled="!newFromAreaId || !newToMapId || !newToAreaId"
                @click="addTransition"
              >
                Aggiungi
              </UButton>
            </div>
          </div>
        </div>
      </div>
    </template>
  </UModal>
</template>
