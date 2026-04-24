<script setup lang="ts">
import { computed } from 'vue'
import type { ChatMessage as ChatMessageType } from '~/stores/chat'

interface Props {
  message: ChatMessageType
  isMaster: boolean
}
const props = defineProps<Props>()

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
  switch (props.message.kind) {
    case 'emote': return { color: 'var(--z-rust-300)', fontStyle: 'italic' }
    case 'ooc': return { color: 'var(--z-toxic-500)', fontSize: '0.8em' }
    case 'whisper': return { color: 'var(--z-whisper-300)', fontStyle: 'italic' }
    case 'shout': return { color: 'var(--z-rust-500)', fontWeight: 'bold' }
    case 'dm': return { color: 'var(--z-whisper-300)' }
    case 'npc': return { color: 'var(--z-green-300)', fontFamily: 'ui-serif, Georgia, serif' }
    case 'announce': return { color: 'var(--z-blood-300)', fontWeight: 'bold', fontStyle: 'italic' }
    case 'system': return { color: 'var(--z-text-lo)', fontSize: '0.8em', fontStyle: 'italic' }
    case 'roll': return { color: 'var(--z-text-hi)' }
    default: return { color: 'var(--z-text-hi)' }
  }
})

const prefix = computed(() => {
  const d = props.message.authorDisplay
  switch (props.message.kind) {
    case 'emote': return `* ${d} `
    case 'ooc': return `((OOC)) ${d}: `
    case 'whisper': return `🔒 ${d} sussurra: `
    case 'shout': return `📣 ${d} urla: `
    case 'dm': return `✉ ${d}: `
    case 'npc': return `${d}: `
    case 'announce': return `ANNUNCIO · `
    case 'system': return ''
    case 'roll': return `🎲 ${d}: `
    default: return `${d}: `
  }
})

const isDeleted = computed(() => props.message.deletedAt !== null)
const isEdited = computed(() => props.message.editedAt !== null)
</script>

<template>
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
      <span>{{ prefix }}</span>
      <span :style="isDeleted ? 'text-decoration: line-through; opacity: 0.5' : undefined">
        {{ message.body }}
      </span>
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
</template>
