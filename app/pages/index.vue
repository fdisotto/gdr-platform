<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useAuth } from '~/composables/useAuth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

useSeoMeta({ title: 'GDR Zombi — Benvenuto' })

const router = useRouter()
const authStore = useAuthStore()
const auth = useAuth()
const feedback = useErrorFeedback()

// Fetch iniziale: il middleware non gira su '/' perché è pubblica, quindi
// facciamo qui il bootstrap dello stato auth al primo load.
if (!authStore.loaded) {
  await authStore.fetchMe()
}

// Redirect superadmin alla dashboard (l'hub gioco non gli interessa)
if (authStore.isSuperadmin) {
  await router.replace('/admin')
}

const displayName = ref('')
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

async function onLogout() {
  await auth.logout()
}
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

      <!-- Non loggato: redirect a login/register -->
      <section
        v-if="!authStore.isUser"
        class="text-center space-y-3 pt-4"
        style="border-top: 1px solid var(--z-border)"
      >
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          Benvenuto. Per giocare serve un account.
        </p>
        <div class="flex justify-center gap-3">
          <NuxtLink
            to="/login"
            class="px-4 py-2 rounded text-sm"
            style="background: var(--z-green-700); color: var(--z-green-100)"
          >
            Login
          </NuxtLink>
          <NuxtLink
            to="/register"
            class="px-4 py-2 rounded text-sm"
            style="background: var(--z-bg-700); color: var(--z-text-hi)"
          >
            Registrati
          </NuxtLink>
        </div>
        <p class="text-xs pt-2">
          <NuxtLink
            to="/admin/login"
            style="color: var(--z-blood-300); text-decoration: underline"
          >
            Pannello admin
          </NuxtLink>
        </p>
      </section>

      <!-- Loggato user: hub crea party -->
      <template v-else>
        <div
          class="flex items-center justify-between text-xs"
          style="color: var(--z-text-md)"
        >
          <span>
            Connesso come
            <strong style="color: var(--z-text-hi)">{{ authStore.identity?.username }}</strong>
          </span>
          <div class="flex gap-3">
            <NuxtLink
              to="/me"
              style="color: var(--z-green-300); text-decoration: underline"
            >
              Profilo
            </NuxtLink>
            <button
              type="button"
              style="color: var(--z-blood-300); text-decoration: underline"
              @click="onLogout"
            >
              Logout
            </button>
          </div>
        </div>

        <section
          class="space-y-3 pt-4"
          style="border-top: 1px solid var(--z-border)"
        >
          <h2
            class="text-sm uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Crea una nuova party
          </h2>
          <form
            class="space-y-3"
            @submit.prevent="onCreate"
          >
            <div>
              <input
                v-model="displayName"
                type="text"
                required
                minlength="2"
                maxlength="24"
                placeholder="Il tuo display name nella party"
                class="w-full px-3 py-2 rounded font-mono-z text-sm"
                style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
              >
              <p
                class="text-xs mt-1"
                style="color: var(--z-text-lo)"
              >
                Verrai inserito come master della nuova party con questo nome.
              </p>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label
                  class="block text-xs uppercase tracking-wide mb-1"
                  style="color: var(--z-text-md)"
                >Visibilità</label>
                <select
                  v-model="visibility"
                  class="w-full px-2 py-2 rounded text-sm"
                  style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
                >
                  <option value="private">
                    Privata
                  </option>
                  <option value="public">
                    Pubblica
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
                  style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
                >
                  <option value="request">
                    Richiesta
                  </option>
                  <option value="auto">
                    Automatico
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
            >
              Crea party
            </UButton>
          </form>
        </section>

        <section
          class="space-y-2 pt-4"
          style="border-top: 1px solid var(--z-border)"
        >
          <h2
            class="text-sm uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            Sfoglia party esistenti
          </h2>
          <p
            class="text-xs"
            style="color: var(--z-text-lo)"
          >
            Cerca party pubbliche, entra direttamente o richiedi l'accesso
            alle party con join su richiesta.
          </p>
          <NuxtLink
            to="/parties"
            class="inline-block px-4 py-2 rounded text-sm"
            style="background: var(--z-bg-700); color: var(--z-text-hi)"
          >
            Vai al browser party
          </NuxtLink>
        </section>
      </template>
    </div>
  </main>
</template>
