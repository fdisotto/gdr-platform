<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '~/composables/useAuth'
import { useErrorFeedback } from '~/composables/useErrorFeedback'

definePageMeta({ layout: false })
useSeoMeta({ title: 'GDR Zombi — Admin Login' })

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
    const res = await auth.adminLogin(username.value, password.value)
    if (res.mustReset) {
      await router.push('/admin/change-password')
    } else {
      await router.push('/admin')
    }
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
          style="color: var(--z-blood-300)"
        >
          Admin
        </h1>
        <p
          class="text-sm"
          style="color: var(--z-text-md)"
        >
          Accesso riservato ai superadmin.
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
          color="error"
          :loading="submitting"
        >
          Entra
        </UButton>
      </form>

      <NuxtLink
        to="/"
        class="block text-xs text-center"
        style="color: var(--z-text-md); text-decoration: underline"
      >
        ← Torna alla home
      </NuxtLink>
    </div>
  </main>
</template>
