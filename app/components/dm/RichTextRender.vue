<script setup lang="ts">
import { computed } from 'vue'
import { parseRich, type RichNode } from '~~/shared/dm/rich'
import RichTextNode from '~/components/dm/RichTextNode.vue'

const props = defineProps<{
  body: string
  // Quando true mostra il "ciao tutti" preservando i newline come <br>.
  // Default true: i DM sono multi-line.
  preserveNewlines?: boolean
}>()

const ast = computed<RichNode[]>(() => parseRich(props.body))
const preserveNewlines = computed(() => props.preserveNewlines !== false)
</script>

<template>
  <span
    class="dm-rich"
    :style="preserveNewlines ? 'white-space: pre-wrap' : undefined"
  >
    <RichTextNode :nodes="ast" />
  </span>
</template>

<style>
.dm-rich .dm-size-1 { font-size: 0.85em; }
.dm-rich .dm-size-2 { font-size: 1em; }
.dm-rich .dm-size-3 { font-size: 1.4em; line-height: 1.25; }
.dm-rich .dm-align { display: block; }
</style>
