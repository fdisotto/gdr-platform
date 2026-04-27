<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  rows?: number
  placeholder?: string
  // 'full' include B/I/U + dimensioni + allineamento; 'minimal' espone
  // solo B/I/U (per la chat normale dove servono giusto le evidenziazioni
  // su parole/frasi).
  mode?: 'full' | 'minimal'
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

const taRef = ref<HTMLTextAreaElement | null>(null)

async function wrap(open: string, close: string, defaultText = '') {
  const ta = taRef.value
  if (!ta) return
  const value = props.modelValue
  const start = ta.selectionStart
  const end = ta.selectionEnd
  const before = value.slice(0, start)
  const inside = value.slice(start, end) || defaultText
  const after = value.slice(end)
  const next = before + open + inside + close + after
  emit('update:modelValue', next)
  await nextTick()
  const refreshed = taRef.value
  if (!refreshed) return
  refreshed.focus()
  const cursorStart = before.length + open.length
  const cursorEnd = cursorStart + inside.length
  refreshed.setSelectionRange(cursorStart, cursorEnd)
}

interface ToolbarButton {
  label: string
  title: string
  open: string
  close: string
  // Stile testo del pulsante (lo stato non è "attivo": è solo un suggerimento
  // visivo del tipo di formattazione che applica).
  buttonStyle?: string
  buttonClass?: string
}

const ALL_BUTTONS: Record<string, ToolbarButton> = {
  bold: { label: 'B', title: 'Grassetto', open: '[b]', close: '[/b]', buttonClass: 'font-bold' },
  italic: { label: 'I', title: 'Corsivo', open: '[i]', close: '[/i]', buttonClass: 'italic' },
  underline: { label: 'U', title: 'Sottolineato', open: '[u]', close: '[/u]', buttonClass: 'underline' },
  size1: { label: 'A−', title: 'Testo piccolo', open: '[size=1]', close: '[/size]', buttonStyle: 'font-size: 0.7rem' },
  size2: { label: 'A', title: 'Testo normale', open: '[size=2]', close: '[/size]', buttonStyle: 'font-size: 0.85rem' },
  size3: { label: 'A+', title: 'Testo grande', open: '[size=3]', close: '[/size]', buttonStyle: 'font-size: 1rem' },
  alignLeft: { label: '⬅', title: 'Allinea a sinistra', open: '[align=left]', close: '[/align]' },
  alignCenter: { label: '⬌', title: 'Centra', open: '[align=center]', close: '[/align]' },
  alignRight: { label: '➡', title: 'Allinea a destra', open: '[align=right]', close: '[/align]' }
}

const FULL_KEYS = ['bold', 'italic', 'underline', 'size1', 'size2', 'size3', 'alignLeft', 'alignCenter', 'alignRight'] as const
const MINIMAL_KEYS = ['bold', 'italic', 'underline'] as const

const buttons = computed<ToolbarButton[]>(() => {
  const keys = props.mode === 'minimal' ? MINIMAL_KEYS : FULL_KEYS
  return keys.map(k => ALL_BUTTONS[k]!)
})
</script>

<template>
  <div class="space-y-1">
    <div
      class="flex flex-wrap gap-1 px-1 py-1 rounded-t"
      style="background: var(--z-bg-700); border: 1px solid var(--z-border); border-bottom: none"
    >
      <button
        v-for="b in buttons"
        :key="b.label"
        type="button"
        :title="b.title"
        :aria-label="b.title"
        :class="['px-2 py-0.5 text-xs rounded leading-none min-w-[28px]', b.buttonClass]"
        :style="`background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border); ${b.buttonStyle ?? ''}`"
        @click="wrap(b.open, b.close)"
      >
        {{ b.label }}
      </button>
    </div>
    <textarea
      ref="taRef"
      :value="modelValue"
      :rows="rows ?? 5"
      :placeholder="placeholder"
      class="w-full px-3 py-2 rounded-b text-sm resize-none"
      style="background: var(--z-bg-900); border: 1px solid var(--z-border); border-top: none; color: var(--z-text-hi); outline: none; margin-top: -1px"
      @input="emit('update:modelValue', ($event.target as HTMLTextAreaElement).value)"
    />
  </div>
</template>
