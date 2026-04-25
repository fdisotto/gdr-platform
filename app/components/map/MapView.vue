<script setup lang="ts">
import { computed, defineAsyncComponent } from 'vue'
import { usePartySeed } from '~/composables/usePartySeed'
import { usePartyMaps } from '~/composables/usePartyMaps'

// Lazy: pixi.js ~150kb gz, carica solo se engine='pixi'.
const MapViewSvg = defineAsyncComponent(() => import('./MapViewSvg.vue'))
const MapViewPixi = defineAsyncComponent(() => import('./MapViewPixi.vue'))

const seed = usePartySeed()
const { activeMap } = usePartyMaps(seed)

interface SystemStatus { renderEngine?: 'svg' | 'pixi' }

// Legge la setting renderEngine via /api/system/status (esposto pubblicamente
// in v2c). Default 'pixi'. SSR è disabled in Nuxt config: useFetch è solo
// client-side e si limita al primo mount.
const { data: status } = await useFetch<SystemStatus>('/api/system/status', {
  default: () => ({ renderEngine: 'pixi' as const })
})
const engine = computed<'svg' | 'pixi'>(() => status.value?.renderEngine ?? 'pixi')
</script>

<template>
  <component
    :is="engine === 'pixi' ? MapViewPixi : MapViewSvg"
    :map="activeMap"
  />
</template>
