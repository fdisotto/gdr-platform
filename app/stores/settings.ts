import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'

const STORAGE_KEY = 'gdr.settings'

interface StoredSettings {
  colorNicknames: boolean
  // 0..1; 0 = muto. Retro-compat: vecchio bool weatherAudio mappato a 0.7/0.
  weatherVolume: number
  voiceEnabled: boolean
  masterVoiceScope: 'zone' | 'global'
  // Notifica suono all'arrivo di messaggi/missive
  notificationsEnabled: boolean
  // Se true: beep anche per messaggi di chat generali; se false: solo DM/whisper diretti
  notificationsChatAll: boolean
}

function readStored(): StoredSettings {
  const fallback: StoredSettings = {
    colorNicknames: true,
    weatherVolume: 0,
    voiceEnabled: false,
    masterVoiceScope: 'zone',
    notificationsEnabled: true,
    notificationsChatAll: false
  }
  if (typeof localStorage === 'undefined') return fallback
  const raw = localStorage.getItem(STORAGE_KEY)
  if (!raw) return fallback
  try {
    const parsed = JSON.parse(raw) as Partial<StoredSettings & { weatherAudio?: boolean }>
    let weatherVolume = parsed.weatherVolume
    if (typeof weatherVolume !== 'number') {
      weatherVolume = parsed.weatherAudio ? 0.7 : 0
    }
    weatherVolume = Math.min(1, Math.max(0, weatherVolume))
    const masterVoiceScope = parsed.masterVoiceScope === 'global' ? 'global' : 'zone'
    return {
      colorNicknames: parsed.colorNicknames ?? true,
      weatherVolume,
      voiceEnabled: false, // never restored: requires fresh gesture each session
      masterVoiceScope,
      notificationsEnabled: parsed.notificationsEnabled ?? true,
      notificationsChatAll: parsed.notificationsChatAll ?? false
    }
  } catch {
    return fallback
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const initial = readStored()
  const colorNicknames = ref(initial.colorNicknames)
  const weatherVolume = ref(initial.weatherVolume)
  // voiceEnabled: non persistito — off all'avvio per safety (microfono richiede gesture esplicita)
  const voiceEnabled = ref(false)
  const voicePerPeerVolumes = ref<Record<string, number>>({})
  const voiceMutedPeers = ref<Set<string>>(new Set())
  const masterVoiceScope = ref<'zone' | 'global'>(initial.masterVoiceScope)
  const notificationsEnabled = ref(initial.notificationsEnabled)
  const notificationsChatAll = ref(initial.notificationsChatAll)

  function persist() {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      colorNicknames: colorNicknames.value,
      weatherVolume: weatherVolume.value,
      masterVoiceScope: masterVoiceScope.value,
      notificationsEnabled: notificationsEnabled.value,
      notificationsChatAll: notificationsChatAll.value
      // voiceEnabled not persisted: requires fresh gesture each session
    }))
  }
  watch(colorNicknames, persist)
  watch(weatherVolume, persist)
  watch(masterVoiceScope, persist)
  watch(notificationsEnabled, persist)
  watch(notificationsChatAll, persist)

  function toggleColorNicknames() {
    colorNicknames.value = !colorNicknames.value
  }
  function setWeatherVolume(v: number) {
    weatherVolume.value = Math.min(1, Math.max(0, v))
  }
  function muteWeather() {
    weatherVolume.value = 0
  }
  function unmuteWeather(target = 0.7) {
    weatherVolume.value = target
  }

  function enableVoice() {
    voiceEnabled.value = true
  }
  function disableVoice() {
    voiceEnabled.value = false
  }
  function setMasterVoiceScope(scope: 'zone' | 'global') {
    masterVoiceScope.value = scope
  }
  function toggleNotifications() {
    notificationsEnabled.value = !notificationsEnabled.value
  }
  function toggleNotificationsChatAll() {
    notificationsChatAll.value = !notificationsChatAll.value
  }

  function setPeerVolume(peerId: string, vol: number) {
    voicePerPeerVolumes.value = { ...voicePerPeerVolumes.value, [peerId]: Math.min(1, Math.max(0, vol)) }
  }
  function togglePeerMute(peerId: string) {
    const next = new Set(voiceMutedPeers.value)
    if (next.has(peerId)) next.delete(peerId)
    else next.add(peerId)
    voiceMutedPeers.value = next
  }

  // Computed retro-compat per i consumer che vogliono solo "audio on"
  const weatherAudio = computed(() => weatherVolume.value > 0)

  return {
    colorNicknames, weatherVolume, weatherAudio,
    toggleColorNicknames, setWeatherVolume, muteWeather, unmuteWeather,
    voiceEnabled, enableVoice, disableVoice,
    voicePerPeerVolumes, voiceMutedPeers, setPeerVolume, togglePeerMute,
    masterVoiceScope, setMasterVoiceScope,
    notificationsEnabled, notificationsChatAll, toggleNotifications, toggleNotificationsChatAll
  }
})
