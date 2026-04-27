<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { stripRich } from '~~/shared/dm/rich'
import RichTextEditor from '~/components/dm/RichTextEditor.vue'

interface AutoDmRow {
  id: string
  partySeed: string
  subject: string
  body: string
  enabled: boolean
  triggerKind: 'on_join'
  createdAt: number
  updatedAt: number
}

const seed = usePartySeed()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()

const items = ref<AutoDmRow[]>([])
const busy = ref(false)

// Stato form: usato sia per la creazione (id null) sia per l'edit di una
// missiva esistente (id valorizzato). Mostrato inline sopra la lista.
const formOpen = ref(false)
const formId = ref<string | null>(null)
const formSubject = ref('')
const formBody = ref('')
const formEnabled = ref(true)

async function load() {
  try {
    const res = await $fetch<{ items: AutoDmRow[] }>(`/api/parties/${seed}/auto-dms`)
    items.value = res.items
  } catch (err) {
    feedback.reportFromError(err)
  }
}

function openCreate() {
  formId.value = null
  formSubject.value = ''
  formBody.value = ''
  formEnabled.value = true
  formOpen.value = true
}

function openEdit(it: AutoDmRow) {
  formId.value = it.id
  formSubject.value = it.subject
  formBody.value = it.body
  formEnabled.value = it.enabled
  formOpen.value = true
}

function cancelForm() {
  formOpen.value = false
  formId.value = null
}

async function submit() {
  if (busy.value) return
  const subject = formSubject.value.trim()
  const body = formBody.value.trim()
  if (!subject || !body) {
    feedbackStore.pushToast({ level: 'warn', title: 'Oggetto e corpo sono obbligatori' })
    return
  }
  busy.value = true
  try {
    if (formId.value) {
      await $fetch(`/api/parties/${seed}/auto-dms/${formId.value}`, {
        method: 'PATCH',
        body: { subject, body, enabled: formEnabled.value }
      })
      feedbackStore.pushToast({ level: 'info', title: 'Missiva automatica aggiornata' })
    } else {
      await $fetch(`/api/parties/${seed}/auto-dms`, {
        method: 'POST',
        body: { subject, body, enabled: formEnabled.value }
      })
      feedbackStore.pushToast({ level: 'info', title: 'Missiva automatica creata' })
    }
    formOpen.value = false
    formId.value = null
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    busy.value = false
  }
}

async function toggle(it: AutoDmRow) {
  try {
    await $fetch(`/api/parties/${seed}/auto-dms/${it.id}`, {
      method: 'PATCH',
      body: { enabled: !it.enabled }
    })
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  }
}

const confirmingId = ref<string | null>(null)
async function remove(it: AutoDmRow) {
  if (confirmingId.value !== it.id) {
    confirmingId.value = it.id
    return
  }
  try {
    await $fetch(`/api/parties/${seed}/auto-dms/${it.id}`, { method: 'DELETE' })
    feedbackStore.pushToast({ level: 'info', title: 'Missiva automatica eliminata' })
    confirmingId.value = null
    await load()
  } catch (err) {
    feedback.reportFromError(err)
  }
}

const formatDate = (ms: number) => {
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

onMounted(load)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between gap-3">
      <div>
        <h3
          class="text-sm font-semibold"
          style="color: var(--z-text-hi)"
        >
          Missive automatiche
        </h3>
        <p
          class="text-xs"
          style="color: var(--z-text-lo)"
        >
          Inviate ai nuovi membri al join. L'autore è il primo master del party.
        </p>
      </div>
      <UButton
        v-if="!formOpen"
        size="xs"
        color="primary"
        icon="i-lucide-plus"
        @click="openCreate"
      >
        Nuova
      </UButton>
    </div>

    <!-- Form inline create/edit -->
    <section
      v-if="formOpen"
      class="rounded-md p-3 space-y-2"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        {{ formId ? 'Modifica missiva' : 'Crea missiva' }}
      </h4>
      <input
        v-model="formSubject"
        type="text"
        maxlength="64"
        placeholder="Oggetto"
        class="w-full bg-transparent border rounded px-2 py-1 text-sm"
        style="border-color: var(--z-border); color: var(--z-text-hi)"
      >
      <RichTextEditor
        v-model="formBody"
        :rows="6"
        placeholder="Testo della missiva"
      />
      <label
        class="flex items-center gap-2 text-xs"
        style="color: var(--z-text-md)"
      >
        <input
          v-model="formEnabled"
          type="checkbox"
        >
        Attiva (verrà inviata ai nuovi membri)
      </label>
      <div class="flex justify-end gap-2">
        <UButton
          size="xs"
          variant="ghost"
          color="neutral"
          :disabled="busy"
          @click="cancelForm"
        >
          Annulla
        </UButton>
        <UButton
          size="xs"
          color="primary"
          :loading="busy"
          @click="submit"
        >
          {{ formId ? 'Salva' : 'Crea' }}
        </UButton>
      </div>
    </section>

    <!-- Lista -->
    <p
      v-if="!items.length && !formOpen"
      class="text-xs italic px-1"
      style="color: var(--z-text-lo)"
    >
      Nessuna missiva automatica configurata.
    </p>

    <ul
      v-if="items.length"
      class="space-y-2"
    >
      <li
        v-for="it in items"
        :key="it.id"
        class="rounded px-3 py-2 text-sm space-y-1"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <div class="flex items-start justify-between gap-3">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span
                class="font-semibold truncate"
                style="color: var(--z-text-hi)"
              >{{ it.subject }}</span>
              <span
                class="text-[10px] uppercase tracking-wide px-1.5 rounded"
                :style="{
                  color: it.enabled ? 'var(--z-green-300)' : 'var(--z-text-lo)',
                  border: '1px solid var(--z-border)'
                }"
              >
                {{ it.enabled ? 'attiva' : 'disattiva' }}
              </span>
            </div>
            <p
              class="text-xs mt-1 line-clamp-3"
              style="color: var(--z-text-md)"
            >
              {{ stripRich(it.body) }}
            </p>
            <p
              class="text-[10px] mt-1"
              style="color: var(--z-text-lo)"
            >
              aggiornata {{ formatDate(it.updatedAt) }}
            </p>
          </div>
          <div class="shrink-0 flex flex-col gap-1">
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              @click="toggle(it)"
            >
              {{ it.enabled ? 'Disattiva' : 'Attiva' }}
            </UButton>
            <UButton
              size="xs"
              variant="soft"
              color="neutral"
              @click="openEdit(it)"
            >
              Modifica
            </UButton>
            <UButton
              size="xs"
              :color="confirmingId === it.id ? 'error' : 'neutral'"
              :variant="confirmingId === it.id ? 'solid' : 'soft'"
              @click="remove(it)"
            >
              {{ confirmingId === it.id ? 'Conferma?' : 'Elimina' }}
            </UButton>
          </div>
        </div>
      </li>
    </ul>
  </div>
</template>
