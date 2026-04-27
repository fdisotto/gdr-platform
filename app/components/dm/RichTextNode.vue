<script lang="ts">
import { Fragment, defineComponent, h, type PropType, type VNode } from 'vue'
import type { RichNode } from '~~/shared/dm/rich'

// Render function manuale: evita whitespace artificiale che il compilatore
// Vue inserirebbe se mappassi i text node tramite `<template> {{ n.value }}
// </template>`. Con `white-space: pre-wrap` sul wrapper quegli spazi
// sarebbero visibili nell'output.
const RichTextNode = defineComponent({
  name: 'RichTextNode',
  props: {
    nodes: {
      type: Array as PropType<RichNode[]>,
      required: true
    }
  },
  setup(props) {
    function renderNodes(nodes: RichNode[]): VNode[] {
      return nodes.map((n, i): VNode => {
        if (n.type === 'text') {
          return h('span', { key: i }, n.value)
        }
        if (n.type === 'b') {
          return h('strong', { key: i }, renderNodes(n.children))
        }
        if (n.type === 'i') {
          return h('em', { key: i }, renderNodes(n.children))
        }
        if (n.type === 'u') {
          return h('u', { key: i }, renderNodes(n.children))
        }
        if (n.type === 'size') {
          return h('span', { key: i, class: `dm-size-${n.value}` }, renderNodes(n.children))
        }
        return h(
          'span',
          { key: i, class: 'dm-align', style: { textAlign: n.value } },
          renderNodes(n.children)
        )
      })
    }
    return () => h(Fragment, null, renderNodes(props.nodes))
  }
})

export default RichTextNode
</script>
