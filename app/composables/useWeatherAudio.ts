import { watch } from 'vue'
import { useSettingsStore } from '~/stores/settings'

interface AudioState {
  ctx: AudioContext | null
  rainNoise: AudioNode | null
  rainGain: GainNode | null
  windNoise: AudioNode | null
  windGain: GainNode | null
  master: GainNode | null
  // Memoria dell ultimo meteo applicato, così quando l audio viene attivato
  // a posteriori possiamo riapplicare lo stato corrente.
  lastCode: string | null
  lastIntensity: number
}

const state: AudioState = {
  ctx: null,
  rainNoise: null,
  rainGain: null,
  windNoise: null,
  windGain: null,
  master: null,
  lastCode: null,
  lastIntensity: 0
}

function createWhiteNoise(ctx: AudioContext): AudioBufferSourceNode {
  const bufferSize = 2 * ctx.sampleRate
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function createBrownNoise(ctx: AudioContext): AudioBufferSourceNode {
  const bufferSize = 2 * ctx.sampleRate
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let lastOut = 0
  for (let i = 0; i < bufferSize; i++) {
    const w = Math.random() * 2 - 1
    data[i] = (lastOut + 0.02 * w) / 1.02
    lastOut = data[i]!
    data[i] = data[i]! * 3.5 // boost gain
  }
  const src = ctx.createBufferSource()
  src.buffer = buffer
  src.loop = true
  return src
}

function ensureContext(): AudioContext {
  if (!state.ctx) {
    state.ctx = new AudioContext()
    state.master = state.ctx.createGain()
    state.master.gain.value = 0
    state.master.connect(state.ctx.destination)
  }
  return state.ctx
}

function ensureRain() {
  const ctx = ensureContext()
  if (state.rainNoise) return
  const noise = createWhiteNoise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.value = 800
  filter.Q.value = 0.5
  const gain = ctx.createGain()
  gain.gain.value = 0
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(state.master!)
  noise.start(0)
  state.rainNoise = noise
  state.rainGain = gain
}

function ensureWind() {
  const ctx = ensureContext()
  if (state.windNoise) return
  const noise = createBrownNoise(ctx)
  const filter = ctx.createBiquadFilter()
  filter.type = 'lowpass'
  filter.frequency.value = 400
  filter.Q.value = 0.6
  const gain = ctx.createGain()
  gain.gain.value = 0
  noise.connect(filter)
  filter.connect(gain)
  gain.connect(state.master!)
  noise.start(0)
  state.windNoise = noise
  state.windGain = gain
}

function setLevel(gain: GainNode | null, target: number) {
  if (!gain || !state.ctx) return
  const now = state.ctx.currentTime
  gain.gain.cancelScheduledValues(now)
  gain.gain.setTargetAtTime(target, now, 0.5)
}

let installed = false

export function useWeatherAudio() {
  const settings = useSettingsStore()

  function applyWeather(code: string | null, intensity: number) {
    if (typeof window === 'undefined') return
    state.lastCode = code
    state.lastIntensity = intensity
    if (settings.weatherVolume <= 0) {
      setLevel(state.master, 0)
      return
    }
    ensureContext()
    ensureRain()
    ensureWind()
    if (state.master) {
      setLevel(state.master, settings.weatherVolume)
    }
    const isRain = code === 'rain' || code === 'storm'
    const isWindy = code === 'storm' || code === 'fog' || code === 'ashfall'
    setLevel(state.rainGain, isRain ? Math.max(0.2, Math.min(0.6, intensity * 0.6)) : 0)
    setLevel(state.windGain, isWindy ? Math.max(0.1, Math.min(0.3, intensity * 0.3)) : 0)
  }

  function thunder() {
    if (typeof window === 'undefined') return
    if (settings.weatherVolume <= 0) return
    const ctx = ensureContext()
    const now = ctx.currentTime
    // Rumble: low sine + filtered noise
    const oscBass = ctx.createOscillator()
    oscBass.type = 'sine'
    oscBass.frequency.value = 60
    oscBass.frequency.exponentialRampToValueAtTime(30, now + 2)
    const oscGain = ctx.createGain()
    oscGain.gain.value = 0
    oscGain.gain.linearRampToValueAtTime(0.7, now + 0.05)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 2.5)

    const noise = createWhiteNoise(ctx)
    const noiseFilter = ctx.createBiquadFilter()
    noiseFilter.type = 'lowpass'
    noiseFilter.frequency.value = 800
    const noiseGain = ctx.createGain()
    noiseGain.gain.value = 0
    noiseGain.gain.linearRampToValueAtTime(0.4, now + 0.02)
    noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 1.5)

    oscBass.connect(oscGain)
    oscGain.connect(state.master!)
    noise.connect(noiseFilter)
    noiseFilter.connect(noiseGain)
    noiseGain.connect(state.master!)

    oscBass.start(now)
    oscBass.stop(now + 3)
    noise.start(now)
    noise.stop(now + 2)
  }

  if (!installed) {
    installed = true
    watch(() => settings.weatherVolume, (vol) => {
      if (vol > 0) {
        ensureContext()
        if (state.ctx?.state === 'suspended') {
          state.ctx.resume().catch(() => {})
        }
        // Riapplica l'ultimo stato meteo (sets rain/wind gain) e master gain
        // = volume corrente.
        applyWeather(state.lastCode, state.lastIntensity)
      } else if (state.master) {
        setLevel(state.master, 0)
      }
    })
  }

  return { applyWeather, thunder }
}
