<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { usePartyStore } from '~/stores/party'
import { usePartySeed } from '~/composables/usePartySeed'
import { useFeedbackStore } from '~/stores/feedback'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

const seed = usePartySeed()
const party = usePartyStore(seed)
const router = useRouter()
const feedbackStore = useFeedbackStore()
const feedback = useErrorFeedback()

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
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    archiving.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <section
      class="rounded-md p-3 space-y-3"
      style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
    >
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-text-md)"
      >
        Impostazioni party
      </h4>
      <dl class="grid grid-cols-2 gap-3 text-sm">
        <dt style="color: var(--z-text-md)">
          Città
        </dt>
        <dd style="color: var(--z-text-hi)">
          {{ party.party?.cityName ?? '—' }}
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
        <dt style="color: var(--z-text-md)">
          Visibilità
        </dt>
        <dd style="color: var(--z-text-hi)">
          {{ visibility === 'public' ? 'Pubblica' : visibility === 'private' ? 'Privata' : '…' }}
        </dd>
        <dt style="color: var(--z-text-md)">
          Accesso
        </dt>
        <dd style="color: var(--z-text-hi)">
          {{ joinPolicy === 'auto' ? 'Automatico' : joinPolicy === 'request' ? 'Su richiesta' : '…' }}
        </dd>
      </dl>
      <p
        class="text-xs italic"
        style="color: var(--z-text-lo)"
      >
        Visibilità e accesso sono fissati alla creazione (modificabili in v2c).
      </p>
    </section>

    <section
      class="rounded-md p-3 space-y-3"
      style="background: var(--z-bg-800); border: 1px solid var(--z-blood-500)"
    >
      <h4
        class="text-xs uppercase tracking-wide"
        style="color: var(--z-blood-300)"
      >
        Archivia party
      </h4>
      <p
        class="text-xs"
        style="color: var(--z-text-md)"
      >
        Chiude la party per tutti i giocatori connessi e la rimuove dal browser.
        L'archiviazione è permanente per la v2b.
      </p>
      <UButton
        color="error"
        variant="soft"
        size="sm"
        :loading="archiving"
        @click="archive"
      >
        Archivia adesso
      </UButton>
    </section>
  </div>
</template>
