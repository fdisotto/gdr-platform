<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { parseSlash, type SlashCommand } from '~~/shared/slash/parse'
import { usePartyStore } from '~/stores/party'
import { usePartyConnection } from '~/composables/usePartyConnection'

interface CommandSuggestion {
  slash: string
  label: string
  hint: string
  template: string
}

const SHORTCUTS: CommandSuggestion[] = [
  { slash: '/me', label: 'Azione', hint: '/me apre la porta', template: '/me ' },
  { slash: '/w', label: 'Sussurro', hint: '/w NICK testo', template: '/w ' },
  { slash: '/shout', label: 'Grido', hint: '/shout aiuto!', template: '/shout ' },
  { slash: '/ooc', label: 'OOC', hint: '/ooc fuori personaggio', template: '/ooc ' },
  { slash: '/roll', label: 'Dado', hint: '/roll 2d6+3', template: '/roll ' },
  { slash: '/dm', label: 'Missiva', hint: '/dm NICK testo (inbox privata)', template: '/dm ' }
]

const ALL_COMMANDS: CommandSuggestion[] = [
  ...SHORTCUTS,
  { slash: '/whisper', label: 'Sussurro', hint: 'alias di /w', template: '/whisper ' },
  { slash: '/roll!', label: 'Dado nasc.', hint: 'master: roll nascosto', template: '/roll! ' },
  { slash: '/npc', label: 'NPC', hint: 'master: parla come NPC', template: '/npc ' },
  { slash: '/announce', label: 'Annuncio', hint: 'master: annuncio globale', template: '/announce ' },
  { slash: '/mute', label: 'Muta', hint: 'master: /mute NICK', template: '/mute ' },
  { slash: '/kick', label: 'Kick', hint: 'master: /kick NICK', template: '/kick ' },
  { slash: '/move', label: 'Muovi', hint: 'master: /move NICK area', template: '/move ' }
]

const party = usePartyStore()
const connection = usePartyConnection()
const input = ref('')
const errorText = ref<string | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const showSuggestions = ref(false)

const history = ref<string[]>([])
const historyIndex = ref<number>(-1) // -1 = non in history (stato corrente)
const draftBeforeHistory = ref<string>('')
const MAX_HISTORY = 30

const suggestions = computed<CommandSuggestion[]>(() => {
  const v = input.value.trimStart()
  if (!v.startsWith('/')) return []
  const firstWord = v.split(' ')[0]!.toLowerCase()
  return ALL_COMMANDS.filter(c => c.slash.startsWith(firstWord))
})

watch(suggestions, (s) => {
  showSuggestions.value = s.length > 0 && input.value.trimStart().startsWith('/') && !input.value.includes(' ')
})

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
  // Aggiungi alla history (dedupe consecutivo)
  if (history.value[history.value.length - 1] !== raw) {
    history.value.push(raw)
    if (history.value.length > MAX_HISTORY) history.value.shift()
  }
  historyIndex.value = -1
  input.value = ''
  showSuggestions.value = false
}

async function applyTemplate(template: string) {
  input.value = template
  showSuggestions.value = false
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.setSelectionRange(template.length, template.length)
}

function pickSuggestion(s: CommandSuggestion) {
  void applyTemplate(s.template)
}

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    showSuggestions.value = false
    return
  }
  if (e.key === 'ArrowUp') {
    if (showSuggestions.value) return // non interferire col dropdown
    if (history.value.length === 0) return
    e.preventDefault()
    if (historyIndex.value === -1) {
      draftBeforeHistory.value = input.value
      historyIndex.value = history.value.length - 1
    } else if (historyIndex.value > 0) {
      historyIndex.value--
    }
    input.value = history.value[historyIndex.value] ?? ''
    const el = inputEl.value
    if (el) {
      const len = input.value.length
      nextTick(() => el.setSelectionRange(len, len))
    }
    return
  }
  if (e.key === 'ArrowDown') {
    if (historyIndex.value === -1) return
    e.preventDefault()
    if (historyIndex.value < history.value.length - 1) {
      historyIndex.value++
      input.value = history.value[historyIndex.value] ?? ''
    } else {
      historyIndex.value = -1
      input.value = draftBeforeHistory.value
      draftBeforeHistory.value = ''
    }
    const el = inputEl.value
    if (el) {
      const len = input.value.length
      nextTick(() => el.setSelectionRange(len, len))
    }
    return
  }
}

function onInputFocus() {
  if (suggestions.value.length > 0 && input.value.trimStart().startsWith('/') && !input.value.includes(' ')) {
    showSuggestions.value = true
  }
}
</script>

<template>
  <div
    class="px-4 py-3 space-y-2"
    style="border-top: 1px solid var(--z-border); position: relative"
  >
    <p
      v-if="errorText"
      class="text-xs"
      style="color: var(--z-blood-300)"
    >
      {{ errorText }}
    </p>

    <div
      v-if="showSuggestions"
      class="absolute left-4 right-4 bottom-full mb-1 rounded-md py-1 z-10"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border); max-height: 220px; overflow-y: auto"
    >
      <button
        v-for="s in suggestions"
        :key="s.slash"
        type="button"
        class="block w-full text-left px-3 py-1.5 text-xs"
        style="color: var(--z-text-hi)"
        @mousedown.prevent="pickSuggestion(s)"
      >
        <span
          class="font-mono-z font-semibold"
          style="color: var(--z-green-300)"
        >{{ s.slash }}</span>
        <span class="ml-2">{{ s.label }}</span>
        <span
          class="ml-2"
          style="color: var(--z-text-lo)"
        >— {{ s.hint }}</span>
      </button>
    </div>

    <!-- Toolbar shortcut -->
    <div class="flex items-center gap-1 flex-wrap">
      <UButton
        v-for="s in SHORTCUTS"
        :key="s.slash"
        type="button"
        size="xs"
        variant="soft"
        color="neutral"
        @click="applyTemplate(s.template)"
      >
        {{ s.label }}
      </UButton>
    </div>

    <form
      class="flex gap-2"
      @submit.prevent="submit"
    >
      <input
        ref="inputEl"
        v-model="input"
        class="flex-1 rounded px-3 py-2 text-sm font-mono-z"
        style="background: var(--z-bg-700); border: 1px solid var(--z-border); color: var(--z-text-hi); outline: none"
        placeholder="Scrivi un messaggio… prova /"
        autocomplete="off"
        @keydown="handleKeydown"
        @focus="onInputFocus"
      >
      <UButton
        type="submit"
        size="sm"
        color="primary"
      >
        Invia
      </UButton>
    </form>
  </div>
</template>
