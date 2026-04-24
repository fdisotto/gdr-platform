<script setup lang="ts">
import { computed, ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { WeatherState } from '~~/shared/map/weather'
import { useWeatherAudio } from '~/composables/useWeatherAudio'

interface Props { weather: WeatherState | null }
const props = defineProps<Props>()

const audio = useWeatherAudio()

const code = computed(() => props.weather?.code ?? 'clear')
const intensity = computed(() => props.weather?.intensity ?? 0)

// Numero particelle in base a intensità
const rainCount = computed(() => {
  if (code.value !== 'rain' && code.value !== 'storm') return 0
  return Math.floor(60 + intensity.value * 80)
})
const ashCount = computed(() => {
  if (code.value !== 'ashfall') return 0
  return Math.floor(40 + intensity.value * 50)
})

// Particelle pre-generate (statiche, animate via CSS)
const rainParticles = computed(() => {
  const arr = []
  for (let i = 0; i < rainCount.value; i++) {
    arr.push({
      id: i,
      x: Math.random() * 1100 - 50,
      y: Math.random() * 700 - 50,
      length: 12 + Math.random() * 18,
      delay: Math.random() * 1000
    })
  }
  return arr
})

const ashParticles = computed(() => {
  const arr = []
  for (let i = 0; i < ashCount.value; i++) {
    arr.push({
      id: i,
      x: Math.random() * 1000,
      y: Math.random() * 700 - 100,
      r: 1 + Math.random() * 2,
      delay: Math.random() * 5000
    })
  }
  return arr
})

// Fulmini: trigger random durante storm
const flashOpacity = ref(0)
let stormTimer: ReturnType<typeof setTimeout> | null = null

function scheduleNextFlash() {
  if (stormTimer) clearTimeout(stormTimer)
  if (code.value !== 'storm') return
  // Random fra 6 e 18 secondi
  const next = 6000 + Math.random() * 12000
  stormTimer = setTimeout(() => {
    triggerFlash()
    scheduleNextFlash()
  }, next)
}

function triggerFlash() {
  // Doppio flash classico
  flashOpacity.value = 0.85
  setTimeout(() => {
    flashOpacity.value = 0.1
  }, 80)
  setTimeout(() => {
    flashOpacity.value = 0.65
  }, 180)
  setTimeout(() => {
    flashOpacity.value = 0
  }, 420)
  // Suono tuono leggermente ritardato (luce vs suono)
  setTimeout(() => audio.thunder(), 200 + Math.random() * 800)
}

watch(code, (newCode) => {
  audio.applyWeather(newCode, intensity.value)
  if (newCode === 'storm') {
    scheduleNextFlash()
  } else if (stormTimer) {
    clearTimeout(stormTimer)
    stormTimer = null
    flashOpacity.value = 0
  }
}, { immediate: true })

watch(intensity, (i) => {
  audio.applyWeather(code.value, i)
})

onMounted(() => {
  if (code.value === 'storm') scheduleNextFlash()
  audio.applyWeather(code.value, intensity.value)
})

onBeforeUnmount(() => {
  if (stormTimer) clearTimeout(stormTimer)
})
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

    <!-- Nebbia: 3 layer con drift diversi per profondità -->
    <g v-if="code === 'fog'">
      <rect
        width="1000"
        height="700"
        fill="#9aa199"
        :opacity="0.1 * intensity + 0.06"
      />
      <rect
        class="fog-band-far"
        width="1200"
        height="160"
        x="-100"
        y="120"
        fill="#c9cfcc"
        :opacity="0.13"
      />
      <rect
        class="fog-band-mid"
        width="1200"
        height="200"
        x="-100"
        y="320"
        fill="#a6aaa7"
        :opacity="0.16"
      />
      <rect
        class="fog-band-near"
        width="1200"
        height="180"
        x="-100"
        y="500"
        fill="#7d827f"
        :opacity="0.14"
      />
    </g>

    <!-- Pioggia: linee diagonali animate, particelle dense -->
    <g
      v-if="code === 'rain' || code === 'storm'"
      class="rain-stream"
    >
      <rect
        width="1000"
        height="700"
        fill="#1a2a38"
        :opacity="0.18 * intensity + 0.08"
      />
      <line
        v-for="p in rainParticles"
        :key="p.id"
        :x1="p.x"
        :y1="p.y"
        :x2="p.x - p.length * 0.4"
        :y2="p.y + p.length"
        stroke="#a5c4de"
        stroke-width="1"
        opacity="0.55"
        :style="`animation-delay: -${p.delay}ms`"
      />
    </g>

    <!-- Cenere: cerchi piccoli che cadono lenti -->
    <g v-if="code === 'ashfall'">
      <rect
        width="1000"
        height="700"
        fill="#3b2a1a"
        :opacity="0.1 * intensity + 0.05"
      />
      <circle
        v-for="p in ashParticles"
        :key="p.id"
        :cx="p.x"
        :cy="p.y"
        :r="p.r"
        fill="#c9c0b2"
        opacity="0.7"
        class="ash-particle"
        :style="`animation-delay: -${p.delay}ms`"
      />
    </g>

    <!-- Flash fulmine durante storm -->
    <rect
      v-if="code === 'storm'"
      width="1000"
      height="700"
      fill="#ffffff"
      :opacity="flashOpacity"
      style="transition: opacity 80ms linear"
    />
  </g>
</template>

<style scoped>
.rain-stream line {
  animation: rain-fall 0.8s linear infinite;
}
.ash-particle {
  animation: ash-fall 12s linear infinite;
}
.fog-band-far {
  animation: fog-drift-slow 28s ease-in-out infinite;
}
.fog-band-mid {
  animation: fog-drift-mid 22s ease-in-out infinite reverse;
}
.fog-band-near {
  animation: fog-drift-fast 16s ease-in-out infinite;
}

@keyframes rain-fall {
  from { transform: translate(0, -20px); }
  to { transform: translate(-15px, 60px); }
}
@keyframes ash-fall {
  from { transform: translate(0, -20px) rotate(0deg); }
  to { transform: translate(-30px, 720px) rotate(360deg); }
}
@keyframes fog-drift-slow {
  0%   { transform: translateX(-80px); opacity: 0.08; }
  50%  { transform: translateX(80px); opacity: 0.18; }
  100% { transform: translateX(-80px); opacity: 0.08; }
}
@keyframes fog-drift-mid {
  0%   { transform: translateX(-60px); opacity: 0.12; }
  50%  { transform: translateX(60px); opacity: 0.2; }
  100% { transform: translateX(-60px); opacity: 0.12; }
}
@keyframes fog-drift-fast {
  0%   { transform: translateX(-40px); opacity: 0.1; }
  50%  { transform: translateX(40px); opacity: 0.18; }
  100% { transform: translateX(-40px); opacity: 0.1; }
}
</style>
