<script setup lang="ts">
import { ref } from 'vue'
import { useSession } from '~/composables/useSession'

const session = useSession()
const input = ref('')
const error = ref<string | null>(null)

function submit() {
  const v = input.value.trim()
  if (v.length < 2 || v.length > 24 || !/^[a-zA-Z0-9 _-]+$/.test(v)) {
    error.value = 'Il nickname deve avere 2-24 caratteri, solo lettere, numeri, spazio, _ o -'
    return
  }
  error.value = null
  session.setNickname(v)
}

function reset() {
  session.clearNickname()
  input.value = ''
}
</script>

<template>
  <div class="space-y-3">
    <div
      v-if="session.nickname.value"
      class="flex items-center gap-3"
    >
      <span
        class="text-sm"
        style="color: var(--z-text-md)"
      >Benvenuto,</span>
      <span
        class="text-lg font-semibold"
        style="color: var(--z-green-300)"
      >{{ session.nickname.value }}</span>
      <UButton
        size="xs"
        variant="ghost"
        @click="reset"
      >
        Cambia
      </UButton>
    </div>
    <form
      v-else
      class="flex gap-2"
      @submit.prevent="submit"
    >
      <UInput
        v-model="input"
        placeholder="Scegli un nickname"
        size="lg"
        class="flex-1"
      />
      <UButton
        type="submit"
        size="lg"
        color="primary"
      >
        Avanti
      </UButton>
    </form>
    <p
      v-if="error"
      class="text-sm"
      style="color: var(--z-blood-300)"
    >
      {{ error }}
    </p>
  </div>
</template>
