<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { usePartyConnections } from '~/composables/usePartyConnections'

const seed = usePartySeed()
const party = usePartyStore(seed)
const router = useRouter()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()
const connection = usePartyConnections().open(seed)

const archiving = ref(false)
const visibility = ref<'public' | 'private' | null>(null)
const joinPolicy = ref<'auto' | 'request' | null>(null)

interface MyMeta {
  items: Array<{ seed: string, visibility: 'public' | 'private', joinPolicy: 'auto' | 'request' }>
}

onMounted(async () => {
  // Recupera visibility/joinPolicy dal browser (filter=mine).
  try {
    const res = await $fetch<MyMeta>('/api/parties', { query: { mine: '1', limit: 50 } })
    const found = res.items.find(p => p.seed === seed)
    if (found) {
      visibility.value = found.visibility
      joinPolicy.value = found.joinPolicy
    }
  } catch { /* fail silenzioso */ }
})

// ── Rinomina città ────────────────────────────────────────────────────
const renamingCity = ref(false)
const cityDraft = ref('')
const cityName = computed(() => party.party?.cityName ?? '—')

function startCityRename() {
  cityDraft.value = cityName.value === '—' ? '' : cityName.value
  renamingCity.value = true
}
function commitCityRename() {
  const name = cityDraft.value.trim().slice(0, 64)
  if (!name) {
    renamingCity.value = false
    return
  }
  connection.send({ type: 'master:set-city-name', name })
  renamingCity.value = false
}
function cancelCityRename() {
  renamingCity.value = false
  cityDraft.value = ''
}

// ── Fog of war toggle ─────────────────────────────────────────────────
const fogEnabled = computed(() => party.party?.fogEnabled !== false)
function toggleFog() {
  connection.send({ type: 'master:fog', enabled: !fogEnabled.value })
}

// ── Archive ───────────────────────────────────────────────────────────
async function archive() {
  if (!confirm('Archiviare questa party? Verrà chiusa per tutti e non sarà più visibile.')) return
  archiving.value = true
  try {
    await $fetch(`/api/parties/${seed}/archive`, { method: 'POST' })
    feedbackStore.pushToast({ level: 'info', title: 'Party archiviata' })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdr:my-parties-changed'))
    }
    await router.push('/')
  } catch (e) {
    feedback.reportFromError(e)
  } finally {
    archiving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- ── Identità della party ────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">🏙</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-green-300)"
        >
          Identità
        </h3>
      </header>
      <dl class="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-x-4 gap-y-2 sm:gap-y-2 text-sm sm:items-center">
        <dt style="color: var(--z-text-md)">
          Nome città
        </dt>
        <dd>
          <div
            v-if="!renamingCity"
            class="flex items-center gap-2"
          >
            <span
              class="flex-1 truncate"
              style="color: var(--z-text-hi)"
            >{{ cityName }}</span>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              icon="i-lucide-pencil"
              @click="startCityRename"
            >
              Rinomina
            </UButton>
          </div>
          <div
            v-else
            class="flex items-center gap-1.5"
          >
            <input
              v-model="cityDraft"
              type="text"
              maxlength="64"
              class="flex-1 px-2 py-1 rounded text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
              autofocus
              @keyup.enter="commitCityRename"
              @keyup.escape="cancelCityRename"
            >
            <UButton
              size="xs"
              color="primary"
              @click="commitCityRename"
            >
              Salva
            </UButton>
            <UButton
              size="xs"
              variant="ghost"
              color="neutral"
              @click="cancelCityRename"
            >
              ×
            </UButton>
          </div>
        </dd>
        <dt style="color: var(--z-text-md)">
          Seed
        </dt>
        <dd
          class="font-mono-z text-xs truncate"
          style="color: var(--z-text-hi)"
        >
          {{ party.party?.seed ?? '—' }}
        </dd>
      </dl>
    </section>

    <!-- ── Accesso e privacy ───────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">🔒</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-rust-300)"
        >
          Accesso
        </h3>
      </header>
      <dl class="grid grid-cols-1 sm:grid-cols-[7rem_1fr] gap-x-4 gap-y-2 text-sm">
        <dt style="color: var(--z-text-md)">
          Visibilità
        </dt>
        <dd style="color: var(--z-text-hi)">
          {{ visibility === 'public' ? 'Pubblica' : visibility === 'private' ? 'Privata' : '…' }}
        </dd>
        <dt style="color: var(--z-text-md)">
          Ingresso
        </dt>
        <dd style="color: var(--z-text-hi)">
          {{ joinPolicy === 'auto' ? 'Automatico' : joinPolicy === 'request' ? 'Su richiesta' : '…' }}
        </dd>
      </dl>
      <p
        class="text-xs italic mt-2"
        style="color: var(--z-text-lo)"
      >
        Visibilità e politica di ingresso sono fissati alla creazione della party.
      </p>
    </section>

    <!-- ── Visibilità in-game ─────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-border)"
      >
        <span class="text-base">👁</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-whisper-300)"
        >
          Visibilità in-game
        </h3>
      </header>
      <div class="flex items-center justify-between gap-3">
        <div>
          <div
            class="text-sm"
            style="color: var(--z-text-hi)"
          >
            Fog of war
          </div>
          <p
            class="text-xs"
            style="color: var(--z-text-md)"
          >
            Quando attiva, i player vedono solo le aree esplorate.
          </p>
        </div>
        <UButton
          size="sm"
          :color="fogEnabled ? 'neutral' : 'primary'"
          :variant="fogEnabled ? 'soft' : 'solid'"
          @click="toggleFog"
        >
          {{ fogEnabled ? 'ON' : 'OFF' }}
        </UButton>
      </div>
    </section>

    <!-- ── Pericolo: archive ──────────────────────────────────────────── -->
    <section>
      <header
        class="flex items-center gap-2 mb-2 pb-1.5"
        style="border-bottom: 1px solid var(--z-blood-500)"
      >
        <span class="text-base">⚠</span>
        <h3
          class="text-sm font-semibold uppercase tracking-wide"
          style="color: var(--z-blood-300)"
        >
          Zona pericolosa
        </h3>
      </header>
      <div class="flex items-center justify-between gap-3">
        <p
          class="text-xs flex-1"
          style="color: var(--z-text-md)"
        >
          Archivia la party: chiusa per tutti i giocatori connessi e rimossa dal browser. Operazione permanente.
        </p>
        <UButton
          color="error"
          variant="soft"
          size="sm"
          :loading="archiving"
          @click="archive"
        >
          Archivia
        </UButton>
      </div>
    </section>
  </div>
</template>
