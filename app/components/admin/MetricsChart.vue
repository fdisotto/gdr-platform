<script setup lang="ts">
import { computed } from 'vue'

interface Point {
  date: string
  value: number
}

const props = withDefaults(defineProps<{
  data: Point[]
  type?: 'line' | 'bar'
  color?: string
  height?: number
}>(), {
  type: 'line',
  color: 'var(--z-green-500)',
  height: 120
})

const W = 600
const PAD_L = 32
const PAD_R = 12
const PAD_T = 8
const PAD_B = 22

const chartHeight = computed(() => props.height)
const innerW = W - PAD_L - PAD_R
const innerH = computed(() => props.height - PAD_T - PAD_B)

const maxY = computed(() => {
  if (!props.data.length) return 1
  const m = Math.max(...props.data.map(p => p.value))
  return m > 0 ? m : 1
})

const stepX = computed(() => {
  if (props.data.length <= 1) return 0
  return innerW / (props.data.length - 1)
})

function xAt(i: number): number {
  return PAD_L + i * stepX.value
}

function yAt(v: number): number {
  return PAD_T + innerH.value - (v / maxY.value) * innerH.value
}

const linePoints = computed(() => {
  if (props.type !== 'line') return ''
  return props.data
    .map((p, i) => `${xAt(i)},${yAt(p.value)}`)
    .join(' ')
})

interface Bar {
  x: number
  y: number
  w: number
  h: number
}

const bars = computed<Bar[]>(() => {
  if (props.type !== 'bar' || !props.data.length) return []
  const slot = props.data.length > 1 ? stepX.value : innerW
  const bw = Math.max(2, slot * 0.7)
  return props.data.map((p, i) => {
    const xc = xAt(i)
    const h = (p.value / maxY.value) * innerH.value
    return {
      x: xc - bw / 2,
      y: PAD_T + innerH.value - h,
      w: bw,
      h
    }
  })
})

interface XLabel {
  x: number
  text: string
}

const xLabels = computed<XLabel[]>(() => {
  const out: XLabel[] = []
  const n = props.data.length
  if (n === 0) return out
  // mostra fino a 5 tick (primo, ultimo, e 3 intermedi se >= 7 punti)
  const ticks = n >= 7 ? [0, Math.floor(n / 4), Math.floor(n / 2), Math.floor(3 * n / 4), n - 1] : [0, n - 1]
  const seen = new Set<number>()
  for (const t of ticks) {
    if (seen.has(t)) continue
    seen.add(t)
    const p = props.data[t]
    if (!p) continue
    out.push({ x: xAt(t), text: p.date.slice(5) })
  }
  return out
})

interface YLabel {
  y: number
  text: string
}

const yLabels = computed<YLabel[]>(() => {
  const m = maxY.value
  const half = m / 2
  return [
    { y: yAt(0), text: '0' },
    { y: yAt(half), text: String(Math.round(half)) },
    { y: yAt(m), text: String(Math.round(m)) }
  ]
})

const isEmpty = computed(() => props.data.length === 0)
</script>

<template>
  <div class="w-full">
    <svg
      v-if="!isEmpty"
      :viewBox="`0 0 ${W} ${chartHeight}`"
      preserveAspectRatio="none"
      class="w-full"
      :style="`height: ${chartHeight}px`"
    >
      <!-- griglia minimal: linee orizzontali -->
      <line
        v-for="(yl, idx) in yLabels"
        :key="`gh-${idx}`"
        :x1="PAD_L"
        :x2="W - PAD_R"
        :y1="yl.y"
        :y2="yl.y"
        stroke="var(--z-border)"
        stroke-width="0.5"
      />
      <!-- bar mode -->
      <rect
        v-for="(b, i) in bars"
        :key="`b-${i}`"
        :x="b.x"
        :y="b.y"
        :width="b.w"
        :height="b.h"
        :fill="color"
      />
      <!-- line mode -->
      <polyline
        v-if="type === 'line' && data.length > 1"
        :points="linePoints"
        fill="none"
        :stroke="color"
        stroke-width="1.5"
      />
      <!-- punti per line mode -->
      <circle
        v-for="(p, i) in (type === 'line' ? data : [])"
        :key="`pt-${i}`"
        :cx="xAt(i)"
        :cy="yAt(p.value)"
        r="2"
        :fill="color"
      />
      <!-- y labels -->
      <text
        v-for="(yl, idx) in yLabels"
        :key="`yl-${idx}`"
        :x="PAD_L - 4"
        :y="yl.y + 3"
        text-anchor="end"
        font-size="9"
        font-family="ui-monospace, monospace"
        fill="var(--z-text-lo)"
      >
        {{ yl.text }}
      </text>
      <!-- x labels -->
      <text
        v-for="(xl, idx) in xLabels"
        :key="`xl-${idx}`"
        :x="xl.x"
        :y="chartHeight - 6"
        text-anchor="middle"
        font-size="9"
        font-family="ui-monospace, monospace"
        fill="var(--z-text-lo)"
      >
        {{ xl.text }}
      </text>
    </svg>
    <p
      v-else
      class="text-xs italic py-4 text-center"
      style="color: var(--z-text-lo)"
    >
      Nessun dato disponibile.
    </p>
  </div>
</template>
