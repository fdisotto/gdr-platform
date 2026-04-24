<script setup lang="ts">
import { computed } from 'vue'
import type { WeatherState } from '~~/shared/map/weather'

interface Props { weather: WeatherState | null }
const props = defineProps<Props>()

const code = computed(() => props.weather?.code ?? 'clear')
const intensity = computed(() => props.weather?.intensity ?? 0)
</script>

<template>
  <g
    pointer-events="none"
    class="weather-layer"
  >
    <!-- Tint per codici atmosferici scuri -->
    <rect
      v-if="code === 'night'"
      width="1000"
      height="700"
      fill="#0a1225"
      :opacity="0.45 * intensity + 0.2"
    />
    <rect
      v-if="code === 'redSky'"
      width="1000"
      height="700"
      fill="#8e2c2c"
      :opacity="0.15 * intensity + 0.08"
    />
    <rect
      v-if="code === 'overcast'"
      width="1000"
      height="700"
      fill="#1a1e22"
      :opacity="0.22 * intensity + 0.1"
    />
    <!-- Nebbia -->
    <g v-if="code === 'fog'">
      <rect
        width="1000"
        height="700"
        fill="#9aa199"
        :opacity="0.14 * intensity + 0.08"
      />
      <rect
        class="fog-band"
        width="1000"
        height="140"
        y="180"
        fill="#c9cfcc"
        :opacity="0.12"
      />
      <rect
        class="fog-band-2"
        width="1000"
        height="120"
        y="420"
        fill="#a6aaa7"
        :opacity="0.1"
      />
    </g>
    <!-- Pioggia -->
    <g v-if="code === 'rain' || code === 'storm'">
      <rect
        width="1000"
        height="700"
        fill="#1a2a38"
        :opacity="0.15 * intensity"
      />
      <g class="rain-stream">
        <line
          v-for="i in 40"
          :key="i"
          :x1="(i * 27) % 1000"
          :y1="-20"
          :x2="(i * 27) % 1000 - 10"
          :y2="20"
          stroke="#a5c4de"
          stroke-width="1"
          opacity="0.55"
        />
      </g>
    </g>
    <!-- Cenere -->
    <g v-if="code === 'ashfall'">
      <rect
        width="1000"
        height="700"
        fill="#3b2a1a"
        :opacity="0.1 * intensity + 0.05"
      />
      <g class="ash-stream">
        <circle
          v-for="i in 30"
          :key="i"
          :cx="(i * 37) % 1000"
          :cy="-10"
          r="1.5"
          fill="#c9c0b2"
          opacity="0.7"
        />
      </g>
    </g>
  </g>
</template>

<style scoped>
.rain-stream {
  animation: rain-fall 0.8s linear infinite;
}
.ash-stream {
  animation: ash-fall 6s linear infinite;
}
.fog-band {
  animation: fog-drift 18s ease-in-out infinite;
}
.fog-band-2 {
  animation: fog-drift 24s ease-in-out infinite reverse;
}

@keyframes rain-fall {
  from { transform: translateY(0); }
  to { transform: translateY(80px); }
}
@keyframes ash-fall {
  from { transform: translate(0, 0); }
  to { transform: translate(-20px, 720px); }
}
@keyframes fog-drift {
  0%   { transform: translateX(-50px); opacity: 0.08; }
  50%  { transform: translateX(50px); opacity: 0.18; }
  100% { transform: translateX(-50px); opacity: 0.08; }
}
</style>
