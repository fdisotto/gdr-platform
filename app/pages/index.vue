<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '~/stores/auth'
import { useAuth } from '~/composables/useAuth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

interface MyPartyRow {
  seed: string
  cityName: string
  lastActivityAt: number
  isMember: boolean
}

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

const myParties = ref<MyPartyRow[]>([])
const loadingMyParties = ref(false)

async function loadMyParties() {
  if (!authStore.isUser) return
  loadingMyParties.value = true
  try {
    const res = await $fetch<{ items: MyPartyRow[] }>('/api/parties', {
      query: { mine: '1', limit: 50 }
    })
    myParties.value = res.items
      .filter(p => p.isMember)
      .sort((a, b) => b.lastActivityAt - a.lastActivityAt)
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    loadingMyParties.value = false
  }
}

onMounted(() => {
  loadMyParties()
})

const formatRelativeShort = (ms: number): string => {
  const diff = Date.now() - ms
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'ora'
  if (m < 60) return `${m}m fa`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h fa`
  const d = Math.floor(h / 24)
  return `${d}g fa`
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

        <!-- I tuoi party: mostrate per prime se ce ne sono. -->
        <section
          v-if="myParties.length > 0"
          class="space-y-2 pt-4"
          style="border-top: 1px solid var(--z-border)"
        >
          <h2
            class="text-sm uppercase tracking-wide"
            style="color: var(--z-text-md)"
          >
            I tuoi party
          </h2>
          <ul class="space-y-1.5">
            <li
              v-for="p in myParties"
              :key="p.seed"
            >
              <NuxtLink
                :to="`/party/${p.seed}`"
                class="flex items-center justify-between gap-3 px-3 py-2 rounded hover:opacity-90"
                style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi)"
              >
                <span class="flex-1 truncate">
                  <span style="color: var(--z-green-300)">🗺</span>
                  <span class="ml-2 font-semibold">{{ p.cityName }}</span>
                </span>
                <span
                  class="text-xs font-mono-z shrink-0"
                  style="color: var(--z-text-lo)"
                >
                  {{ formatRelativeShort(p.lastActivityAt) }}
                </span>
              </NuxtLink>
            </li>
          </ul>
        </section>

        <p
          v-else-if="loadingMyParties"
          class="text-xs italic pt-4"
          style="color: var(--z-text-lo); border-top: 1px solid var(--z-border)"
        >
          Caricamento dei tuoi party…
        </p>
        <p
          v-else
          class="text-xs italic pt-4"
          style="color: var(--z-text-lo); border-top: 1px solid var(--z-border)"
        >
          Non sei ancora in nessun party. Sfogliane una pubblica o creane una qui sotto.
        </p>

        <!-- CTA: due pulsanti grossi side-by-side per crea / sfoglia -->
        <section
          class="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4"
          style="border-top: 1px solid var(--z-border)"
        >
          <NuxtLink
            to="/parties/new"
            class="block p-5 rounded text-center hover:opacity-90 transition-opacity"
            style="background: var(--z-green-700); color: var(--z-green-100); border: 1px solid var(--z-green-300)"
          >
            <div class="text-2xl mb-1">
              ✚
            </div>
            <div class="text-sm font-semibold">
              Crea party
            </div>
            <p
              class="text-xs mt-1 opacity-80"
            >
              Diventi master, scegli visibilita' e ingresso.
            </p>
          </NuxtLink>
          <NuxtLink
            to="/parties"
            class="block p-5 rounded text-center hover:opacity-90 transition-opacity"
            style="background: var(--z-bg-800); color: var(--z-text-hi); border: 1px solid var(--z-border)"
          >
            <div class="text-2xl mb-1">
              🔍
            </div>
            <div class="text-sm font-semibold">
              Sfoglia party
            </div>
            <p
              class="text-xs mt-1"
              style="color: var(--z-text-md)"
            >
              Entra in un party pubblico o chiedi accesso.
            </p>
          </NuxtLink>
        </section>
      </template>
    </div>
  </main>
</template>
