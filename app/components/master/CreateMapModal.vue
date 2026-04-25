<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

// v2d: modale di creazione mappa per il master. I tipi di mappa abilitati
// sono i 3 standard MVP (city/country/wasteland). L'admin può abilitarne
// altri post-MVP, ma per ora hardcode evita di esporre l'endpoint admin
// `/api/admin/map-types` ai master non admin.

interface MapType {
  id: string
  name: string
  description: string
  enabled: boolean
}

const seed = usePartySeed()
const err = useErrorFeedback()
const emit = defineEmits<{
  (e: 'close' | 'created'): void
}>()

const types = ref<MapType[]>([])
const mapTypeId = ref<string>('')
const name = ref('')
const customSeed = ref('')
const isSpawn = ref(false)
const submitting = ref(false)

onMounted(() => {
  types.value = [
    { id: 'city', name: 'Città', description: 'Tessuto urbano', enabled: true },
    { id: 'country', name: 'Campagna', description: 'Aree aperte', enabled: true },
    { id: 'wasteland', name: 'Lande', description: 'Distese desolate', enabled: true }
  ]
  mapTypeId.value = 'city'
})

async function submit() {
  if (!mapTypeId.value || !name.value.trim()) return
  submitting.value = true
  try {
    await $fetch(`/api/parties/${seed}/maps`, {
      method: 'POST',
      body: {
        mapTypeId: mapTypeId.value,
        name: name.value.trim(),
        mapSeed: customSeed.value.trim() || undefined,
        isSpawn: isSpawn.value
      }
    })
    emit('created')
  } catch (e) {
    err.reportFromError(e)
  } finally {
    submitting.value = false
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
        <h3
          class="text-sm font-semibold"
          style="color: var(--z-text-hi)"
        >
          Crea nuova mappa
        </h3>
        <div class="space-y-2">
          <label
            class="block text-xs"
            style="color: var(--z-text-md)"
          >
            Tipo
            <select
              v-model="mapTypeId"
              class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
              <option
                v-for="t in types.filter(x => x.enabled)"
                :key="t.id"
                :value="t.id"
              >
                {{ t.name }} — {{ t.description }}
              </option>
            </select>
          </label>
          <label
            class="block text-xs"
            style="color: var(--z-text-md)"
          >
            Nome
            <input
              v-model="name"
              type="text"
              maxlength="32"
              placeholder="es. Bosco a nord"
              class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
          </label>
          <label
            class="block text-xs"
            style="color: var(--z-text-md)"
          >
            Seed (opzionale, lascia vuoto per random)
            <input
              v-model="customSeed"
              type="text"
              maxlength="64"
              placeholder="random uuid"
              class="block w-full mt-1 px-2 py-1 rounded font-mono-z text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
          </label>
          <label
            class="flex items-center gap-2 text-xs"
            style="color: var(--z-text-md)"
          >
            <input
              v-model="isSpawn"
              type="checkbox"
            >
            Imposta come spawn
          </label>
        </div>
        <div class="flex gap-2 justify-end">
          <UButton
            size="xs"
            variant="ghost"
            @click="emit('close')"
          >
            Annulla
          </UButton>
          <UButton
            size="xs"
            variant="solid"
            color="primary"
            :loading="submitting"
            :disabled="!mapTypeId || !name.trim()"
            @click="submit"
          >
            Crea
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
