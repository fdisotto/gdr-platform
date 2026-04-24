<script setup lang="ts">
import { computed, ref, onBeforeUnmount } from 'vue'
import type { ChatMessage as ChatMessageType } from '~/stores/chat'
import { useSettingsStore } from '~/stores/settings'
import { seedFromString } from '~~/shared/seed/prng'
import { usePartyConnection } from '~/composables/usePartyConnection'

interface Props {
  message: ChatMessageType
  isMaster: boolean
}
const props = defineProps<Props>()
const settings = useSettingsStore()
const connection = usePartyConnection()

const NICK_COLORS = [
  '#7cbe79', '#9aa13a', '#d4965b', '#a8572a',
  '#9b81a8', '#b96565', '#4f8aa3', '#c9a66b',
  '#6ec3a6', '#c26f8e'
]

function nicknameColor(display: string): string {
  const h = seedFromString(display)
  return NICK_COLORS[h % NICK_COLORS.length]!
}

const time = computed(() => {
  const d = new Date(props.message.createdAt)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
})

const rollData = computed(() => {
  if (props.message.kind !== 'roll' || !props.message.rollPayload) return null
  try {
    return JSON.parse(props.message.rollPayload) as {
      expr: string
      rolls: { count: number, sides: number, values: number[] }[]
      modifier: number
      total: number
    }
  } catch {
    return null
  }
})

const kindStyle = computed(() => {
  const k = props.message.kind
  switch (k) {
    case 'emote': return { color: 'var(--z-rust-300)', fontStyle: 'italic' }
    case 'ooc': return { color: 'var(--z-toxic-500)', fontSize: '0.85em' }
    case 'whisper': return { color: 'var(--z-whisper-300)', fontStyle: 'italic' }
    case 'shout': return { color: 'var(--z-rust-500)', fontWeight: 'bold' }
    case 'dm': return { color: 'var(--z-whisper-300)' }
    case 'npc': return { color: 'var(--z-green-300)', fontFamily: 'ui-serif, Georgia, serif' }
    case 'announce': return { color: 'var(--z-blood-300)', fontWeight: 'bold', fontStyle: 'italic' }
    case 'system': return { color: 'var(--z-text-lo)', fontSize: '0.85em', fontStyle: 'italic' }
    case 'roll': return { color: 'var(--z-text-hi)' }
    default: return { color: 'var(--z-text-hi)' }
  }
})

const nickStyle = computed(() => {
  if (!settings.colorNicknames) return {}
  return { color: nicknameColor(props.message.authorDisplay) }
})

const prefixBefore = computed(() => {
  switch (props.message.kind) {
    case 'emote': return '* '
    case 'ooc': return '((OOC)) '
    case 'whisper': return '🔒 '
    case 'shout': return '📣 '
    case 'dm': return '✉ '
    case 'roll': return '🎲 '
    case 'announce': return 'ANNUNCIO · '
    default: return ''
  }
})

const prefixAfter = computed(() => {
  switch (props.message.kind) {
    case 'emote': return ' ' // emote: "* Nick walks"
    case 'ooc': return ': '
    case 'whisper': return ' sussurra: '
    case 'shout': return ' urla: '
    case 'dm': return ': '
    case 'npc': return ': '
    case 'roll': return ': '
    case 'system': return ''
    default: return ': '
  }
})

const showNickname = computed(() => props.message.kind !== 'system' && props.message.kind !== 'announce')

const isDeleted = computed(() => props.message.deletedAt !== null)
const isEdited = computed(() => props.message.editedAt !== null)

// Master context menu
const showMenu = ref(false)
const editing = ref(false)
const editBody = ref('')
const menuRoot = ref<HTMLElement | null>(null)

function openMenu(e: MouseEvent) {
  if (!props.isMaster) return
  e.preventDefault()
  showMenu.value = true
}
function closeMenu() {
  showMenu.value = false
}
function startEdit() {
  editBody.value = props.message.body
  editing.value = true
  closeMenu()
}
function commitEdit() {
  if (!editBody.value.trim()) return
  connection.send({ type: 'master:edit-message', messageId: props.message.id, newBody: editBody.value })
  editing.value = false
}
function cancelEdit() {
  editing.value = false
}
function deleteMsg() {
  connection.send({ type: 'master:delete-message', messageId: props.message.id })
  closeMenu()
}
function copyText() {
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(props.message.body).catch(() => {})
  }
  closeMenu()
}
function onDocClick(e: MouseEvent) {
  if (!showMenu.value) return
  if (menuRoot.value && menuRoot.value.contains(e.target as Node)) return
  closeMenu()
}
if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', onDocClick)
  onBeforeUnmount(() => document.removeEventListener('mousedown', onDocClick))
}
</script>

<template>
  <div
    ref="menuRoot"
    class="relative"
    @contextmenu="openMenu"
  >
    <div
      class="text-sm"
      :style="kindStyle"
    >
      <span
        class="text-xs font-mono-z mr-2"
        style="color: var(--z-text-lo)"
      >
        {{ time }}
      </span>
      <span
        v-if="isDeleted && !isMaster"
        style="color: var(--z-text-lo); font-style: italic"
      >
        [messaggio rimosso]
      </span>
      <template v-else>
        <span>{{ prefixBefore }}</span>
        <span
          v-if="showNickname"
          :style="nickStyle"
          class="font-semibold"
        >{{ message.authorDisplay }}</span>
        <span>{{ prefixAfter }}</span>
        <span
          :style="{
            whiteSpace: 'pre-wrap',
            ...(isDeleted ? { textDecoration: 'line-through', opacity: 0.5 } : {})
          }"
        >{{ message.body }}</span>
        <span
          v-if="message.kind === 'roll' && rollData"
          class="ml-2 font-mono-z text-xs px-2 py-0.5 rounded"
          style="background: var(--z-bg-700); color: var(--z-green-300)"
        >
          {{ rollData.expr }} = <strong>{{ rollData.total }}</strong>
          <span
            v-if="rollData.rolls.length"
            style="color: var(--z-text-md)"
          >
            [{{ rollData.rolls.flatMap(r => r.values).join(', ') }}<span v-if="rollData.modifier !== 0">{{ rollData.modifier > 0 ? '+' : '' }}{{ rollData.modifier }}</span>]
          </span>
        </span>
        <span
          v-if="isEdited"
          class="ml-2 text-xs italic"
          style="color: var(--z-text-lo)"
        >
          (modificato)
        </span>
      </template>
    </div>
    <div
      v-if="editing"
      class="mt-1 flex gap-2"
    >
      <textarea
        v-model="editBody"
        rows="2"
        class="flex-1 bg-transparent border rounded px-2 py-1 text-sm font-mono-z"
        style="border-color: var(--z-border); color: var(--z-text-hi)"
      />
      <UButton
        size="xs"
        color="primary"
        @click="commitEdit"
      >
        Salva
      </UButton>
      <UButton
        size="xs"
        color="neutral"
        variant="ghost"
        @click="cancelEdit"
      >
        ×
      </UButton>
    </div>
    <div
      v-if="showMenu"
      class="absolute right-0 top-full mt-1 z-30 rounded-md py-1"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border); min-width: 160px"
    >
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs hover:opacity-80"
        style="color: var(--z-text-hi)"
        @click="copyText"
      >
        Copia testo
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs hover:opacity-80"
        style="color: var(--z-text-hi)"
        @click="startEdit"
      >
        Modifica
      </button>
      <button
        type="button"
        class="block w-full text-left px-3 py-1 text-xs hover:opacity-80"
        style="color: var(--z-blood-300)"
        @click="deleteMsg"
      >
        Cancella
      </button>
    </div>
  </div>
</template>
