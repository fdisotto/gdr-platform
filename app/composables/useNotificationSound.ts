// Piccoli beep procedurali per notifiche chat:
// - 'msg': un tono corto medio, volume basso
// - 'dm': due toni brevi (più insistente) per missive/whisper diretti
// Nessun asset: web audio puro, così nessun fetch esterno e nessun flash al refresh.

import { useSettingsStore } from '~/stores/settings'

let ctx: AudioContext | null = null
let lastPlayedAt = 0
const MIN_INTERVAL_MS = 150

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!ctx) {
    try {
      ctx = new AudioContext()
    } catch {
      return null
    }
  }
  return ctx
}

function playTone(freq: number, startAt: number, duration: number, peakGain: number) {
  const audio = ensureCtx()
  if (!audio) return
  const osc = audio.createOscillator()
  osc.type = 'sine'
  osc.frequency.value = freq
  const gain = audio.createGain()
  gain.gain.value = 0
  osc.connect(gain)
  gain.connect(audio.destination)
  const t0 = audio.currentTime + startAt
  gain.gain.setValueAtTime(0, t0)
  gain.gain.linearRampToValueAtTime(peakGain, t0 + 0.01)
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration)
  osc.start(t0)
  osc.stop(t0 + duration + 0.05)
}

export function playNotificationSound(kind: 'msg' | 'dm') {
  const settings = useSettingsStore()
  if (!settings.notificationsEnabled) return
  if (kind === 'msg' && !settings.notificationsChatAll) return
  const now = Date.now()
  if (now - lastPlayedAt < MIN_INTERVAL_MS) return
  lastPlayedAt = now
  const audio = ensureCtx()
  if (!audio) return
  if (audio.state === 'suspended') audio.resume().catch(() => {})
  if (kind === 'dm') {
    playTone(880, 0, 0.12, 0.18)
    playTone(1320, 0.14, 0.12, 0.18)
  } else {
    playTone(660, 0, 0.08, 0.12)
  }
}
