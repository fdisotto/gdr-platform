<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

useSeoMeta({ title: 'GDR Zombi — Login' })

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const feedback = useErrorFeedback()

const username = ref('')
const password = ref('')
const submitting = ref(false)

async function onSubmit() {
  if (submitting.value) return
  submitting.value = true
  try {
    const res = await auth.login(username.value, password.value)
    if (res.mustReset) {
      await router.push('/me?force-reset=1')
      return
    }
    const next = typeof route.query.next === 'string' ? route.query.next : '/'
    await router.push(next)
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
          Accedi
        </h1>
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          Entra con il tuo account per giocare.
        </p>
      </header>

      <form
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
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>
        <div>
          <label
            class="block text-xs uppercase tracking-wide mb-1"
            style="color: var(--z-text-md)"
          >Password</label>
          <input
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full px-3 py-2 rounded font-mono-z text-sm"
            style="background: var(--z-bg-800); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
          >
        </div>
        <UButton
          type="submit"
          block
          color="primary"
          :loading="submitting"
        >
          Entra
        </UButton>
      </form>

      <div
        class="flex flex-col gap-2 text-xs text-center"
        style="color: var(--z-text-md)"
      >
        <NuxtLink
          to="/register"
          style="color: var(--z-green-300); text-decoration: underline"
        >
          Non hai un account? Registrati
        </NuxtLink>
        <NuxtLink
          to="/admin/login"
          style="color: var(--z-blood-300)"
        >
          Pannello admin
        </NuxtLink>
      </div>
    </div>
  </main>
</template>
