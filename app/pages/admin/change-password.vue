<script setup lang="ts">
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useAuthStore } from '~/stores/auth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'
import { useFeedbackStore } from '~/stores/feedback'

definePageMeta({ layout: false })
useSeoMeta({ title: 'GDR Zombi — Admin cambio password' })

const router = useRouter()
const authStore = useAuthStore()
const auth = useAuth()
const feedback = useErrorFeedback()
const toast = useFeedbackStore()

const current = ref('')
const next = ref('')
const confirm = ref('')
const submitting = ref(false)

const valid = computed(() =>
  current.value.length > 0
  && next.value.length >= 8
  && confirm.value === next.value
)

async function onSubmit() {
  if (!valid.value || submitting.value) return
  submitting.value = true
  try {
    await auth.adminChangePassword(current.value, next.value)
    toast.pushToast({ level: 'info', title: 'Password aggiornata' })
    await router.push('/admin')
  } catch (err) {
    feedback.reportFromError(err)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <main class="min-h-screen flex items-center justify-center p-8">
    <div class="w-full max-w-md space-y-6">
      <header class="space-y-1 text-center">
        <h1
          class="text-2xl font-bold"
          style="color: var(--z-blood-300)"
        >
          Cambia password admin
        </h1>
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          <span
            v-if="authStore.identity?.mustReset"
            style="color: var(--z-rust-300)"
          >Devi cambiare la password di default prima di poter operare.</span>
          <span v-else>Imposta una nuova password per l'account admin.</span>
        </p>
      </header>

      <form
        class="space-y-3 p-4 rounded-md"
        style="background: var(--z-bg-800); border: 1px solid var(--z-border)"
        @submit.prevent="onSubmit"
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
          color="error"
          :loading="submitting"
          :disabled="!valid"
        >
          Aggiorna
        </UButton>
      </form>
    </div>
  </main>
</template>
