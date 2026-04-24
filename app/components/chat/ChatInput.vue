<script setup lang="ts">
import { ref } from 'vue'
import { parseSlash, type SlashCommand } from '~~/shared/slash/parse'
import { usePartyStore } from '~/stores/party'
import { usePartyConnection } from '~/composables/usePartyConnection'

const party = usePartyStore()
const connection = usePartyConnection()
const input = ref('')
const errorText = ref<string | null>(null)

function resolveTargetPlayerId(nickname: string): string | null {
  const target = party.players.find(p => p.nickname.toLowerCase() === nickname.toLowerCase())
  return target?.id ?? null
}

function commandToWsEvent(cmd: SlashCommand, areaId: string | null): Record<string, unknown> | { error: string } {
  switch (cmd.kind) {
    case 'say':
    case 'emote':
    case 'ooc':
    case 'shout':
      return { type: 'chat:send', kind: cmd.kind, body: cmd.body, areaId }
    case 'whisper': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'chat:send', kind: 'whisper', body: cmd.body, areaId, targetPlayerId: targetId }
    }
    case 'dm': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'chat:send', kind: 'dm', body: cmd.body, targetPlayerId: targetId }
    }
    case 'roll':
      return { type: 'chat:send', kind: 'roll', body: cmd.expr, rollExpr: cmd.expr, areaId }
    default:
      return { error: 'comando master non ancora disponibile in questa versione' }
  }
}

function submit() {
  const raw = input.value.trim()
  if (!raw) return
  const parsed = parseSlash(raw)
  if (!parsed.ok) {
    errorText.value = `Comando non valido: ${parsed.error}`
    return
  }
  const areaId = party.me?.currentAreaId ?? null
  const result = commandToWsEvent(parsed.command, areaId)
  if ('error' in result) {
    errorText.value = result.error as string
    return
  }
  errorText.value = null
  connection.send(result)
  input.value = ''
}
</script>

<template>
  <form
    class="px-4 py-3 space-y-2"
    style="border-top: 1px solid var(--z-border)"
    @submit.prevent="submit"
  >
    <p
      v-if="errorText"
      class="text-xs"
      style="color: var(--z-blood-300)"
    >
      {{ errorText }}
    </p>
    <div class="flex gap-2">
      <UInput
        v-model="input"
        placeholder="Scrivi un messaggio… prova /w nick, /me, /roll 2d6, /dm nick, /shout, /ooc"
        class="flex-1 font-mono-z"
        autocomplete="off"
      />
      <UButton
        type="submit"
        size="sm"
        color="primary"
      >
        Invia
      </UButton>
    </div>
  </form>
</template>
