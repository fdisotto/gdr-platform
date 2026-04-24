<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useAuthStore } from '~/stores/auth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { useFeedbackStore } from '~/stores/feedback'

useSeoMeta({ title: 'GDR Zombi — Profilo' })

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const auth = useAuth()
const feedback = useErrorFeedback()
const toastStore = useFeedbackStore()

const forceReset = computed(() => route.query['force-reset'] === '1' || authStore.identity?.mustReset === true)

const current = ref('')
const next = ref('')
const confirm = ref('')
const submitting = ref(false)

const valid = computed(() =>
  current.value.length > 0
  && next.value.length >= 8
  && confirm.value === next.value
)

async function onChange() {
  if (!valid.value || submitting.value) return
  submitting.value = true
  try {
    await auth.changePassword(current.value, next.value)
    toastStore.pushToast({ level: 'info', title: 'Password aggiornata' })
    current.value = ''
    next.value = ''
    confirm.value = ''
    // Se veniamo da force-reset, libera la route
    if (route.query['force-reset']) {
      await router.replace('/me')
    }
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    submitting.value = false
  }
}

async function onLogout() {
  await auth.logout()
  await router.push('/login')
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-md space-y-6">
      <header class="space-y-1">
        <h1
          class="text-2xl font-bold"
          style="color: var(--z-green-300)"
        >
          Profilo
        </h1>
        <p
          class="text-sm font-mono-z"
          style="color: var(--z-text-md)"
        >
          {{ authStore.identity?.username }}
          <span
            class="ml-2 px-2 py-0.5 text-xs rounded"
            :style="authStore.isSuperadmin
              ? 'background: var(--z-blood-700); color: var(--z-blood-300)'
              : 'background: var(--z-bg-700); color: var(--z-text-md)'"
          >{{ authStore.identity?.kind }}</span>
        </p>
      </header>

      <div
        v-if="forceReset"
        class="rounded p-3 text-sm"
        style="background: var(--z-blood-700); color: var(--z-blood-300); border: 1px solid var(--z-blood-500)"
      >
        Devi cambiare la password prima di continuare a usare la piattaforma.
      </div>

      <section
        class="rounded-md p-4 space-y-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <h2
          class="text-sm uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Cambia password
        </h2>
        <form
          class="space-y-2"
          @submit.prevent="onChange"
        >
          <div>
            <label
              class="block text-xs mb-1"
              style="color: var(--z-text-md)"
            >Password attuale</label>
            <input
              v-model="current"
              type="password"
              autocomplete="current-password"
              required
              class="w-full px-3 py-2 rounded font-mono-z text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
          </div>
          <div>
            <label
              class="block text-xs mb-1"
              style="color: var(--z-text-md)"
            >Nuova password</label>
            <input
              v-model="next"
              type="password"
              autocomplete="new-password"
              required
              minlength="8"
              class="w-full px-3 py-2 rounded font-mono-z text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
          </div>
          <div>
            <label
              class="block text-xs mb-1"
              style="color: var(--z-text-md)"
            >Conferma</label>
            <input
              v-model="confirm"
              type="password"
              autocomplete="new-password"
              required
              class="w-full px-3 py-2 rounded font-mono-z text-sm"
              style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
            >
          </div>
          <UButton
            type="submit"
            block
            color="primary"
            :loading="submitting"
            :disabled="!valid"
          >
            Aggiorna password
          </UButton>
        </form>
      </section>

      <section
        class="rounded-md p-4 space-y-2"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
      >
        <h2
          class="text-sm uppercase tracking-wide"
          style="color: var(--z-text-md)"
        >
          Personaggio
        </h2>
        <p
          class="text-xs italic"
          style="color: var(--z-text-lo)"
        >
          Caratteristiche, abilità e inventario arriveranno in una versione successiva.
        </p>
      </section>

      <div class="flex justify-between items-center pt-2">
        <NuxtLink
          to="/"
          class="text-xs"
          style="color: var(--z-text-md); text-decoration: underline"
        >
          ← Home
        </NuxtLink>
        <UButton
          size="sm"
          color="error"
          variant="soft"
          @click="onLogout"
        >
          Logout
        </UButton>
      </div>
    </div>
  </main>
</template>
