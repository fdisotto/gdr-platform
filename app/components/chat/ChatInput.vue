<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { parseSlash, type SlashCommand } from '~~/shared/slash/parse'
import { AREA_IDS } from '~~/shared/map/areas'
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
  { slash: '/unmute', label: 'Riabilita', hint: 'master: /unmute NICK', template: '/unmute ' },
  { slash: '/kick', label: 'Kick', hint: 'master: /kick NICK', template: '/kick ' },
  { slash: '/ban', label: 'Ban', hint: 'master: /ban NICK', template: '/ban ' },
  { slash: '/unban', label: 'Unban', hint: 'master: /unban NICK', template: '/unban ' },
  { slash: '/move', label: 'Muovi', hint: 'master: /move NICK area', template: '/move ' },
  { slash: '/close', label: 'Chiudi area', hint: 'master: /close area_id', template: '/close ' },
  { slash: '/open', label: 'Apri area', hint: 'master: /open area_id', template: '/open ' },
  { slash: '/weather', label: 'Meteo', hint: 'master: /weather area_id', template: '/weather ' },
  { slash: '/setname', label: 'Rinomina', hint: 'master: /setname area_id', template: '/setname ' },
  { slash: '/status', label: 'Stato area', hint: 'master: /status area_id', template: '/status ' }
]

const MASTER_ONLY_CMDS = new Set([
  '/roll!', '/npc', '/announce', '/mute', '/unmute',
  '/kick', '/ban', '/unban', '/move', '/close', '/open',
  '/weather', '/setname', '/status'
])

const ROLL_PRESETS = [
  { value: '1d20', hint: 'd20 nudo' },
  { value: '2d6', hint: 'classico 2d6' },
  { value: '1d20+3', hint: 'd20 con bonus' },
  { value: '3d6+2', hint: '3d6 con mod' },
  { value: '1d100', hint: 'd100 percentuale' }
]

const DRAFT_KEY = 'gdr.chatDraft'
const MAX_LINES = 5
const LINE_HEIGHT_PX = 22

const party = usePartyStore()
const connection = usePartyConnection()
const input = ref('')
const errorText = ref<string | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

const history = ref<string[]>([])
const historyIndex = ref<number>(-1)
const draftBeforeHistory = ref<string>('')
const MAX_HISTORY = 30

// Fix 1 — filtra comandi master per utenti normali
const visibleCommands = computed<CommandSuggestion[]>(() => {
  const isMaster = party.me?.role === 'master'
  if (isMaster) return ALL_COMMANDS
  return ALL_COMMANDS.filter(c => !MASTER_ONLY_CMDS.has(c.slash))
})

const suggestions = computed<CommandSuggestion[]>(() => {
  const v = input.value.trimStart()
  if (!v.startsWith('/')) return []
  const firstWord = v.split(' ')[0]!.toLowerCase()
  return visibleCommands.value.filter(c => c.slash.startsWith(firstWord))
})

// Fix 4 — context autocomplete per argomenti
const argSuggestions = computed<CommandSuggestion[]>(() => {
  const v = input.value.trimStart()
  if (!v.startsWith('/')) return []
  const parts = v.split(' ')
  if (parts.length < 2) return []
  const cmd = parts[0]!.toLowerCase()
  const partial = (parts[1] ?? '').toLowerCase()

  const nicknameCmds = new Set(['/w', '/whisper', '/dm', '/mute', '/unmute', '/kick', '/ban', '/unban', '/move'])
  if (nicknameCmds.has(cmd)) {
    return party.players
      .filter(p => p.id !== party.me?.id)
      .filter(p => p.nickname.toLowerCase().startsWith(partial))
      .slice(0, 8)
      .map(p => ({
        slash: p.nickname,
        label: p.role === 'master' ? '(master)' : '',
        hint: 'in ' + p.currentAreaId,
        template: `${cmd} ${p.nickname} `
      }))
  }

  const areaCmds = new Set(['/close', '/open', '/status', '/setname', '/weather'])
  if (areaCmds.has(cmd)) {
    return (AREA_IDS as readonly string[])
      .filter(a => a.startsWith(partial))
      .slice(0, 10)
      .map(a => ({
        slash: a,
        label: '',
        hint: 'area',
        template: `${cmd} ${a} `
      }))
  }

  if (cmd === '/roll' || cmd === '/roll!') {
    return ROLL_PRESETS
      .filter(p => p.value.startsWith(partial))
      .map(p => ({
        slash: p.value,
        label: '',
        hint: p.hint,
        template: `${cmd} ${p.value}`
      }))
  }

  return []
})

// Fix 4 — showSuggestions diventa computed
const showSuggestions = computed(() => {
  return suggestions.value.length > 0 || argSuggestions.value.length > 0
})

// Fix 2 — draft save in localStorage
onMounted(() => {
  if (typeof localStorage !== 'undefined') {
    input.value = localStorage.getItem(DRAFT_KEY) ?? ''
  }
  void nextTick().then(autoResize)
})

watch(input, (v) => {
  if (typeof localStorage === 'undefined') return
  if (v) localStorage.setItem(DRAFT_KEY, v)
  else localStorage.removeItem(DRAFT_KEY)
})

// Fix 3 — auto-resize textarea
function autoResize() {
  const el = inputEl.value
  if (!el) return
  el.style.height = 'auto'
  const max = LINE_HEIGHT_PX * MAX_LINES + 16
  el.style.height = Math.min(el.scrollHeight, max) + 'px'
  el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden'
}

watch(input, () => {
  void nextTick().then(autoResize)
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
    case 'close':
      return { type: 'master:area', areaId: cmd.areaId, status: 'closed' }
    case 'open':
      return { type: 'master:area', areaId: cmd.areaId, status: 'intact' }
    case 'mute': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'master:mute', playerId: targetId, minutes: cmd.minutes }
    }
    case 'unmute': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'master:unmute', playerId: targetId }
    }
    case 'kick': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'master:kick', playerId: targetId, reason: cmd.reason }
    }
    case 'ban': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'master:ban', playerId: targetId, reason: cmd.reason }
    }
    case 'unban': {
      return { type: 'master:unban', nicknameLower: cmd.target.toLowerCase() }
    }
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
  if (history.value[history.value.length - 1] !== raw) {
    history.value.push(raw)
    if (history.value.length > MAX_HISTORY) history.value.shift()
  }
  historyIndex.value = -1
  input.value = ''
  localStorage.removeItem(DRAFT_KEY)
}

async function applyTemplate(template: string) {
  input.value = template
  await nextTick()
  inputEl.value?.focus()
  inputEl.value?.setSelectionRange(template.length, template.length)
}

function pickSuggestion(s: CommandSuggestion) {
  void applyTemplate(s.template)
}

// Fix 3 — handleKeydown unificato per textarea
function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') {
    return
  }
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      // newline naturale
      return
    }
    e.preventDefault()
    submit()
    return
  }
  // History solo se input single-line (no newline)
  if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !input.value.includes('\n')) {
    if (e.key === 'ArrowUp') {
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
    } else {
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
    }
  }
}

function onInputFocus() {
  // showSuggestions è ora computed, nessuna azione manuale necessaria
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
      <div
        v-if="argSuggestions.length > 0 && suggestions.length > 0"
        style="height: 1px; background: var(--z-border); margin: 4px 0"
      />
      <button
        v-for="s in argSuggestions"
        :key="`arg-${s.slash}`"
        type="button"
        class="block w-full text-left px-3 py-1.5 text-xs"
        style="color: var(--z-text-hi)"
        @mousedown.prevent="pickSuggestion(s)"
      >
        <span
          class="font-mono-z font-semibold"
          style="color: var(--z-rust-300)"
        >{{ s.slash }}</span>
        <span
          v-if="s.label"
          class="ml-2"
        >{{ s.label }}</span>
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
      <textarea
        ref="inputEl"
        v-model="input"
        rows="1"
        class="flex-1 bg-transparent border px-3 py-2 rounded font-mono-z text-sm resize-none"
        style="border-color: var(--z-border); color: var(--z-text-hi); line-height: 22px; outline: none"
        placeholder="Scrivi un messaggio… prova /. Shift+Enter = nuova riga"
        autocomplete="off"
        @keydown="handleKeydown"
        @focus="onInputFocus"
      />
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
