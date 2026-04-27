<script setup lang="ts">
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { parseSlash, type SlashCommand } from '~~/shared/slash/parse'
import { usePartyStore } from '~/stores/party'
import { useZombiesStore } from '~/stores/zombies'
import { useChatStore, type ChatMessage } from '~/stores/chat'
import { usePartyConnections } from '~/composables/usePartyConnections'
import { usePartySeed } from '~/composables/usePartySeed'
import { useActiveMapAreas } from '~/composables/useActiveMapAreas'

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

const seed = usePartySeed()
const party = usePartyStore(seed)
const zombiesStore = useZombiesStore(seed)
const chatStore = useChatStore(seed)
const connection = usePartyConnections().open(seed)
const activeMapAreas = useActiveMapAreas(seed)

const WEATHER_CODES = [
  { value: 'clear', hint: 'sereno' },
  { value: 'overcast', hint: 'nuvoloso' },
  { value: 'fog', hint: 'nebbia' },
  { value: 'rain', hint: 'pioggia' },
  { value: 'storm', hint: 'tempesta' },
  { value: 'ashfall', hint: 'cenere' },
  { value: 'redSky', hint: 'cielo rosso' },
  { value: 'night', hint: 'notte' },
  { value: 'off', hint: 'rimuovi override' }
]
const WEATHER_INTENSITIES = [
  { value: '0.3', hint: 'lieve' },
  { value: '0.5', hint: 'medio' },
  { value: '0.7', hint: 'forte' },
  { value: '1', hint: 'massimo' }
]
const AREA_STATUSES = [
  { value: 'intact', hint: 'zona integra' },
  { value: 'infested', hint: 'infestata' },
  { value: 'ruined', hint: 'in rovina' },
  { value: 'closed', hint: 'chiusa' }
]
const MUTE_PRESETS = [
  { value: '5', hint: '5 min' },
  { value: '15', hint: '15 min' },
  { value: '60', hint: '1 ora' },
  { value: '0', hint: 'permanente' }
]
const input = ref('')
const errorText = ref<string | null>(null)
const inputEl = ref<HTMLTextAreaElement | null>(null)

// Toolbar minimale di formattazione: B/I/U avvolgono la selezione corrente
// con i tag bbcode-like supportati dal renderer DM. Solo evidenziazioni
// inline, niente size/align (riservati alle missive).
const FORMAT_BUTTONS: Array<{ label: string, title: string, open: string, close: string, buttonClass?: string }> = [
  { label: 'B', title: 'Grassetto', open: '[b]', close: '[/b]', buttonClass: 'font-bold' },
  { label: 'I', title: 'Corsivo', open: '[i]', close: '[/i]', buttonClass: 'italic' },
  { label: 'U', title: 'Sottolineato', open: '[u]', close: '[/u]', buttonClass: 'underline' }
]

async function wrapInput(open: string, close: string) {
  const ta = inputEl.value
  if (!ta) return
  const value = input.value
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const before = value.slice(0, start)
  const inside = value.slice(start, end)
  const after = value.slice(end)
  input.value = before + open + inside + close + after
  await nextTick()
  const refreshed = inputEl.value
  if (!refreshed) return
  refreshed.focus()
  const cursorStart = before.length + open.length
  const cursorEnd = cursorStart + inside.length
  refreshed.setSelectionRange(cursorStart, cursorEnd)
}

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

// argIdx = indice dell argomento in corso (1 = primo dopo il comando)
// Prefisso = tutti i token precedenti ricostruiti, così il template mantiene il contesto.
// Token con spazi (nickname "Marco Rossi", npc "Poliziotto Robert") vengono
// quotati automaticamente così parseSlash li riconosce come singolo arg.
function quoteIfNeeded(s: string): string {
  return s.includes(' ') ? `"${s}"` : s
}
const argSuggestions = computed<CommandSuggestion[]>(() => {
  const v = input.value.trimStart()
  if (!v.startsWith('/')) return []
  const parts = v.split(' ')
  if (parts.length < 2) return []
  const cmd = parts[0]!.toLowerCase()
  const argIdx = parts.length - 1
  const rawPartial = parts[argIdx] ?? ''
  // Se l'utente sta scrivendo un token quotato (/w "Mar...), rimuovi la
  // virgoletta iniziale per matchare correttamente con il nome pieno.
  const partial = rawPartial.replace(/^"/, '').toLowerCase()
  const prefix = parts.slice(0, argIdx).join(' ')

  const mk = (value: string, hint: string, label = '', appendSpace = true): CommandSuggestion => {
    const quoted = quoteIfNeeded(value)
    return {
      slash: value,
      label,
      hint,
      template: `${prefix} ${quoted}${appendSpace ? ' ' : ''}`
    }
  }

  // /npc NAME body — primo arg: nomi NPC esistenti
  if (cmd === '/npc' && argIdx === 1) {
    return zombiesStore.npcNames
      .filter(n => n.toLowerCase().startsWith(partial))
      .slice(0, 10)
      .map(n => mk(n, 'NPC'))
  }

  // Comandi con target nickname in 1a posizione
  const nicknameCmdsIdx1 = new Set(['/w', '/whisper', '/dm', '/mute', '/unmute', '/kick', '/ban', '/unban', '/move'])
  if (nicknameCmdsIdx1.has(cmd) && argIdx === 1) {
    return party.players
      .filter(p => p.id !== party.me?.id)
      .filter(p => p.nickname.toLowerCase().startsWith(partial))
      .slice(0, 8)
      .map(p => mk(p.nickname, 'in ' + p.currentAreaId, p.role === 'master' ? '(master)' : ''))
  }

  // /mute NICK MINUTI — secondo arg
  if (cmd === '/mute' && argIdx === 2) {
    return MUTE_PRESETS
      .filter(m => m.value.startsWith(partial))
      .map(m => mk(m.value, m.hint, '', false))
  }

  // /move NICK AREA — secondo arg
  if (cmd === '/move' && argIdx === 2) {
    return activeMapAreas.value
      .filter(a => a.id.toLowerCase().startsWith(partial))
      .slice(0, 10)
      .map(a => mk(a.id, a.name, '', false))
  }

  // Comandi con area in 1a posizione
  const areaCmdsIdx1 = new Set(['/close', '/open', '/status', '/setname', '/weather'])
  if (areaCmdsIdx1.has(cmd) && argIdx === 1) {
    const candidates: Array<{ id: string, name: string }> = activeMapAreas.value.slice()
    if (cmd === '/weather') candidates.unshift({ id: '*', name: 'tutte le aree' })
    return candidates
      .filter(a => a.id.toLowerCase().startsWith(partial))
      .slice(0, 12)
      .map(a => mk(a.id, a.name))
  }

  // /status AREA STATUS — secondo arg
  if (cmd === '/status' && argIdx === 2) {
    return AREA_STATUSES
      .filter(s => s.value.startsWith(partial))
      .map(s => mk(s.value, s.hint, '', false))
  }

  // /weather AREA CODE [INTENSITY] — secondo e terzo arg
  if (cmd === '/weather' && argIdx === 2) {
    return WEATHER_CODES
      .filter(c => c.value.toLowerCase().startsWith(partial))
      .map(c => mk(c.value, c.hint))
  }
  if (cmd === '/weather' && argIdx === 3) {
    return WEATHER_INTENSITIES
      .filter(i => i.value.startsWith(partial))
      .map(i => mk(i.value, i.hint, '', false))
  }

  // /roll presets — primo arg (espressione dado)
  if ((cmd === '/roll' || cmd === '/roll!') && argIdx === 1) {
    return ROLL_PRESETS
      .filter(p => p.value.startsWith(partial))
      .map(p => mk(p.value, p.hint, '', false))
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
    case 'npc': {
      const npcAreaId = party.me?.currentAreaId
      if (!npcAreaId) return { error: 'nessuna area' }
      return { type: 'master:npc', areaId: npcAreaId, npcName: cmd.npcName, body: cmd.body }
    }
    case 'announce':
      return { type: 'master:announce', body: cmd.body }
    case 'roll': {
      if (cmd.hidden) return { type: 'master:hidden-roll', expr: cmd.expr }
      return { type: 'chat:send', kind: 'roll', body: cmd.expr, rollExpr: cmd.expr, areaId }
    }
    case 'weather': {
      if ('clear' in cmd && cmd.clear) {
        return { type: 'master:weather-override', areaId: cmd.areaId, clear: true }
      }
      return {
        type: 'master:weather-override',
        areaId: (cmd as { areaId: string | null, code: string, intensity: number | null }).areaId,
        code: (cmd as { areaId: string | null, code: string, intensity: number | null }).code,
        intensity: (cmd as { areaId: string | null, code: string, intensity: number | null }).intensity ?? 0.7
      }
    }
    case 'move': {
      const targetId = resolveTargetPlayerId(cmd.target)
      if (!targetId) return { error: `giocatore non trovato: ${cmd.target}` }
      return { type: 'master:move-player', playerId: targetId, toAreaId: cmd.areaId }
    }
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

// Ritorna il ChatMessage optimistic da aggiungere subito allo store, oppure
// null se il comando non è un semplice chat:send (es. slash master).
function makeOptimistic(event: Record<string, unknown>, areaId: string | null): ChatMessage | null {
  if (event.type !== 'chat:send') return null
  const me = party.me
  if (!me) return null
  const kind = String(event.kind)
  // Non fare optimistic per roll (server calcola) o per kind non standard
  if (kind === 'roll') return null
  const body = typeof event.body === 'string' ? event.body : ''
  const targetPlayerId = typeof event.targetPlayerId === 'string' ? event.targetPlayerId : null
  const msgAreaId = kind === 'dm' ? null : areaId
  return {
    id: `pending-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    partySeed: party.party?.seed ?? '',
    kind,
    authorPlayerId: me.id,
    authorDisplay: me.nickname,
    areaId: msgAreaId,
    targetPlayerId,
    body,
    rollPayload: null,
    createdAt: Date.now(),
    deletedAt: null,
    deletedBy: null,
    editedAt: null,
    pending: true
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
  // Optimistic append: se non siamo "open" il messaggio andrà in coda,
  // mostrarlo subito come pending così l'utente vede che è partito.
  if (connection.status.value !== 'open') {
    const optimistic = makeOptimistic(result, areaId)
    if (optimistic) {
      if (optimistic.kind === 'dm' && party.me) {
        chatStore.appendPendingDm(optimistic, party.me.id)
      } else {
        chatStore.appendPending(optimistic)
      }
    }
  }
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
      class="flex flex-col gap-1"
      @submit.prevent="submit"
    >
      <div class="flex flex-wrap gap-1">
        <button
          v-for="b in FORMAT_BUTTONS"
          :key="b.label"
          type="button"
          :title="b.title"
          :aria-label="b.title"
          :class="['px-2 py-0.5 text-xs rounded leading-none min-w-[28px]', b.buttonClass]"
          style="background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)"
          @click="wrapInput(b.open, b.close)"
        >
          {{ b.label }}
        </button>
      </div>
      <div class="flex gap-2">
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
      </div>
    </form>
  </div>
</template>
