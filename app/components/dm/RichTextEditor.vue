<script setup lang="ts">
import { nextTick, ref } from 'vue'

const props = defineProps<{
  modelValue: string
  rows?: number
  placeholder?: string
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

const buttons: Array<{
  label: string
  title: string
  open: string
  close: string
  className?: string
}> = [
  { label: 'B', title: 'Grassetto', open: '[b]', close: '[/b]', className: 'font-bold' },
  { label: 'I', title: 'Corsivo', open: '[i]', close: '[/i]', className: 'italic' },
  { label: 'U', title: 'Sottolineato', open: '[u]', close: '[/u]', className: 'underline' },
  { label: 'S', title: 'Testo piccolo', open: '[size=1]', close: '[/size]' },
  { label: 'M', title: 'Testo normale', open: '[size=2]', close: '[/size]' },
  { label: 'L', title: 'Testo grande', open: '[size=3]', close: '[/size]' },
  { label: '⇤', title: 'Allinea a sinistra', open: '[align=left]', close: '[/align]' },
  { label: '↔', title: 'Centra', open: '[align=center]', close: '[/align]' },
  { label: '⇥', title: 'Allinea a destra', open: '[align=right]', close: '[/align]' }
]
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
        :class="['px-2 py-0.5 text-xs rounded', b.className]"
        style="background: var(--z-bg-800); color: var(--z-text-md); border: 1px solid var(--z-border)"
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
