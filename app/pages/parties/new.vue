<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

useSeoMeta({ title: 'GDR Zombi — Crea party' })

const router = useRouter()
const authStore = useAuthStore()
const feedback = useErrorFeedback()

const displayName = ref(authStore.identity?.username ?? '')
const partyName = ref('')
const mapName = ref('')
const mapTypeId = ref<'city' | 'country' | 'wasteland'>('city')
const visibility = ref<'public' | 'private'>('private')
const joinPolicy = ref<'auto' | 'request'>('request')
const creating = ref(false)

const canCreate = computed(() =>
  displayName.value.length >= 2
  && displayName.value.length <= 24
  && authStore.isUser
)

async function onCreate() {
  if (!canCreate.value || creating.value) return
  creating.value = true
  try {
    const res = await $fetch<{ seed: string }>('/api/parties', {
      method: 'POST',
      body: {
        displayName: displayName.value,
        cityName: partyName.value.trim() || undefined,
        mapName: mapName.value.trim() || undefined,
        mapTypeId: mapTypeId.value,
        visibility: visibility.value,
        joinPolicy: joinPolicy.value
      }
    })
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('gdr:my-parties-changed'))
    }
    await router.push(`/party/${res.seed}`)
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    creating.value = false
  }
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-xl space-y-6">
      <header class="space-y-2">
        <NuxtLink
          to="/"
          class="text-xs"
          style="color: var(--z-text-md); text-decoration: underline"
        >
          ← Torna alla home
        </NuxtLink>
        <h1
          class="text-3xl font-bold tracking-tight"
          style="color: var(--z-green-300)"
        >
          Crea un nuovo party
        </h1>
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          Sarai il master del party. Potrai poi rinominare il party
          e cambiare le mappe dal pannello master.
        </p>
      </header>

      <form
        class="space-y-4 p-5 rounded"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @submit.prevent="onCreate"
      >
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >
            Display name
          </label>
          <input
            v-model="displayName"
            type="text"
            required
            minlength="2"
            maxlength="24"
            placeholder="Come ti vedranno gli altri"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
          <p
            class="text-xs mt-1"
            style="color: var(--z-text-lo)"
          >
            Verrai inserito come master del nuovo party con questo nome.
          </p>
        </div>

        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >
            Nome del party
          </label>
          <input
            v-model="partyName"
            type="text"
            maxlength="64"
            placeholder="lascia vuoto per nome generato"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Nome prima mappa</label>
            <input
              v-model="mapName"
              type="text"
              maxlength="64"
              placeholder="lascia vuoto per nome città"
              class="w-full px-2 py-2 rounded font-mono-z text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
          </div>
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Tipo prima mappa</label>
            <select
              v-model="mapTypeId"
              class="w-full px-2 py-2 rounded text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
              <option value="city">
                🏙 Città
              </option>
              <option value="country">
                🌳 Campagna
              </option>
              <option value="wasteland">
                🏚 Wasteland
              </option>
            </select>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Visibilità</label>
            <select
              v-model="visibility"
              class="w-full px-2 py-2 rounded text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
              <option value="private">
                Privata (solo via invito)
              </option>
              <option value="public">
                Pubblica (accessibile da tutti)
              </option>
            </select>
          </div>
          <div>
            <label
              class="block text-xs uppercase tracking-wide mb-1"
              style="color: var(--z-text-md)"
            >Accesso</label>
            <select
              v-model="joinPolicy"
              class="w-full px-2 py-2 rounded text-sm"
              style="background: var(--z-bg-900); border: 1px solid var(--z-border); color: var(--z-text-hi)"
            >
              <option value="request">
                Su richiesta (approvi tu)
              </option>
              <option value="auto">
                Automatico (entrano subito)
              </option>
            </select>
          </div>
        </div>
        <UButton
          type="submit"
          color="primary"
          :loading="creating"
          :disabled="!canCreate"
          block
          size="lg"
        >
          Crea party
        </UButton>
      </form>
    </div>
  </main>
</template>
