<script setup lang="ts">
import { ref, computed } from 'vue'
import { useAuth } from '~/composables/useAuth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { USERNAME_REGEX } from '~~/shared/protocol/http'

useSeoMeta({ title: 'GDR Zombi — Registrati' })

const auth = useAuth()
const feedback = useErrorFeedback()

const username = ref('')
const password = ref('')
const confirm = ref('')
const submitting = ref(false)
const sent = ref(false)

const usernameValid = computed(() => {
  const u = username.value
  return u.length >= 3 && u.length <= 32 && USERNAME_REGEX.test(u)
})
const passwordValid = computed(() => password.value.length >= 8)
const confirmValid = computed(() => confirm.value === password.value && confirm.value.length > 0)
const formValid = computed(() => usernameValid.value && passwordValid.value && confirmValid.value)

async function onSubmit() {
  if (submitting.value || !formValid.value) return
  submitting.value = true
  try {
    await auth.register(username.value, password.value)
    sent.value = true
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-sm space-y-6">
      <header class="text-center space-y-2">
        <h1
          class="text-3xl font-bold tracking-tight"
          style="color: var(--z-green-300)"
        >
          Registrazione
        </h1>
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          Un superadmin dovrà approvare la tua richiesta prima che tu possa fare login.
        </p>
      </header>

      <div
        v-if="sent"
        class="rounded p-4 text-sm space-y-3"
        style="background: var(--z-bg-800); border: 1px solid var(--z-green-500); color: var(--z-text-hi)"
      >
        <p
          class="font-semibold"
          style="color: var(--z-green-300)"
        >
          Richiesta inviata
        </p>
        <p>
          Il tuo account è in coda di approvazione. Una volta approvato potrai fare login con le credenziali scelte.
        </p>
        <NuxtLink
          to="/login"
          class="inline-block text-xs underline"
          style="color: var(--z-green-300)"
        >
          Vai al login
        </NuxtLink>
      </div>

      <form
        v-else
        class="space-y-3"
        @submit.prevent="onSubmit"
      >
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Username</label>
          <input
            v-model="username"
            type="text"
            autocomplete="username"
            autofocus
            required
            minlength="3"
            maxlength="32"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
          <p
            class="text-xs mt-1"
            :style="username && !usernameValid
              ? 'color: var(--z-rust-300)'
              : 'color: var(--z-text-lo)'"
          >
            3–32 caratteri, solo lettere, numeri, <code>_</code> e <code>-</code>.
          </p>
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="8"
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
          <p
            class="text-xs mt-1"
            :style="password && !passwordValid
              ? 'color: var(--z-rust-300)'
              : 'color: var(--z-text-lo)'"
          >
            Almeno 8 caratteri.
          </p>
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Conferma password</label>
          <input
            v-model="confirm"
            type="password"
            autocomplete="new-password"
            required
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
          <p
            v-if="confirm && !confirmValid"
            class="text-xs mt-1"
            style="color: var(--z-rust-300)"
          >
            Le password non coincidono.
          </p>
        </div>
        <UButton
          type="submit"
          block
          color="primary"
          :loading="submitting"
          :disabled="!formValid"
        >
          Invia richiesta
        </UButton>
      </form>

      <NuxtLink
        to="/login"
        class="block text-xs text-center"
        style="color: var(--z-green-300); text-decoration: underline"
      >
        Hai già un account? Entra
      </NuxtLink>
    </div>
  </main>
</template>
