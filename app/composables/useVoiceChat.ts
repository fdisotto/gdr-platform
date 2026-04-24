import { ref, watch, type Ref } from 'vue'
import { usePartyConnection } from '~/composables/usePartyConnection'
import { usePartyStore } from '~/stores/party'
import { useSettingsStore } from '~/stores/settings'

interface PeerState {
  pc: RTCPeerConnection
  audio: HTMLAudioElement
  speaking: boolean
}

let installed = false

const localStreamRef: Ref<MediaStream | null> = ref(null)
const peerStatesRef: Ref<Map<string, PeerState>> = ref(new Map())
const speakingPeersRef: Ref<Set<string>> = ref(new Set())
const errorRef: Ref<string | null> = ref(null)
// isTransmitting: true se il microfono locale sta effettivamente inviando
// audio verso i peer. In modalità continuous coincide con voiceEnabled.
// In modalità ptt, è true solo mentre l'utente tiene premuto il tasto
// configurato (desktop) o l'icona mic (mobile).
const isTransmittingRef: Ref<boolean> = ref(false)
// isSelfSpeaking: true quando il VAD locale rileva audio sopra soglia.
// Usato per animazione visiva dell'icona mic.
const isSelfSpeakingRef: Ref<boolean> = ref(false)
let audioContextForVad: AudioContext | null = null
let selfVadAttached = false

function applyTrackEnabled(enabled: boolean) {
  if (!localStreamRef.value) return
  for (const t of localStreamRef.value.getAudioTracks()) {
    t.enabled = enabled
  }
}

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' }
]

function makeAudioElement(): HTMLAudioElement {
  const el = document.createElement('audio')
  el.autoplay = true
  el.style.display = 'none'
  document.body.appendChild(el)
  return el
}

async function ensureLocalStream(): Promise<MediaStream | null> {
  if (localStreamRef.value) return localStreamRef.value
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
    // Parti in silenzio: i watch in useVoiceChat abiliteranno i track in
    // base a mode (continuous → on, ptt → on solo durante press).
    for (const t of stream.getAudioTracks()) t.enabled = false
    localStreamRef.value = stream
    attachLocalVad(stream)
    return stream
  } catch (e) {
    errorRef.value = (e as Error).message ?? 'getUserMedia failed'
    return null
  }
}

// VAD sul local stream: monitora il volume del mic per animare l'icona.
// Va in idle (isSelfSpeaking=false) se il track è disabled (caso PTT non
// premuto o voce off) così non pulsa quando non stiamo trasmettendo.
function attachLocalVad(stream: MediaStream) {
  if (selfVadAttached) return
  if (typeof window === 'undefined') return
  if (!audioContextForVad) {
    audioContextForVad = new AudioContext()
  }
  const ctx = audioContextForVad
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)
  selfVadAttached = true
  const loop = () => {
    analyser.getByteFrequencyData(data)
    let sum = 0
    for (const v of data) sum += v
    const avg = sum / data.length
    // Soglia leggermente più alta del peer VAD (12) per evitare che
    // rumore di fondo del mic acceso triggeri l'animazione.
    const rawSpeaking = avg > 15
    // Se il track è disabled (PTT off, voce off), forza speaking=false
    const tracks = stream.getAudioTracks()
    const active = tracks.length > 0 && tracks.some(t => t.enabled)
    const speaking = rawSpeaking && active
    if (isSelfSpeakingRef.value !== speaking) {
      isSelfSpeakingRef.value = speaking
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function attachVad(peerId: string, stream: MediaStream) {
  if (typeof window === 'undefined') return
  if (!audioContextForVad) {
    audioContextForVad = new AudioContext()
  }
  const ctx = audioContextForVad
  const source = ctx.createMediaStreamSource(stream)
  const analyser = ctx.createAnalyser()
  analyser.fftSize = 512
  source.connect(analyser)
  const data = new Uint8Array(analyser.frequencyBinCount)
  const loop = () => {
    analyser.getByteFrequencyData(data)
    let sum = 0
    for (const v of data) sum += v
    const avg = sum / data.length
    const speaking = avg > 12
    const cur = peerStatesRef.value.get(peerId)
    if (cur && cur.speaking !== speaking) {
      cur.speaking = speaking
      const next = new Set(speakingPeersRef.value)
      if (speaking) next.add(peerId)
      else next.delete(peerId)
      speakingPeersRef.value = next
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
}

function sendSignal(connection: ReturnType<typeof usePartyConnection>, ev: Record<string, unknown>) {
  connection.send(ev)
}

async function createOutgoingPeer(
  connection: ReturnType<typeof usePartyConnection>,
  peerId: string,
  polite = false
): Promise<PeerState | null> {
  if (peerStatesRef.value.has(peerId)) return peerStatesRef.value.get(peerId)!
  const stream = await ensureLocalStream()
  if (!stream) return null
  const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })
  for (const track of stream.getTracks()) {
    pc.addTrack(track, stream)
  }
  const audio = makeAudioElement()
  const state: PeerState = { pc, audio, speaking: false }
  const next = new Map(peerStatesRef.value)
  next.set(peerId, state)
  peerStatesRef.value = next

  pc.addEventListener('icecandidate', (e) => {
    if (e.candidate) {
      sendSignal(connection, {
        type: 'voice:ice',
        targetPlayerId: peerId,
        candidate: JSON.stringify(e.candidate.toJSON())
      })
    }
  })
  pc.addEventListener('track', (e) => {
    audio.srcObject = e.streams[0] ?? null
    if (e.streams[0]) attachVad(peerId, e.streams[0])
  })
  pc.addEventListener('connectionstatechange', () => {
    if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
      removePeer(peerId)
    }
  })

  if (!polite) {
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    sendSignal(connection, {
      type: 'voice:offer',
      targetPlayerId: peerId,
      sdp: JSON.stringify(pc.localDescription)
    })
  }
  return state
}

async function handleSignal(
  connection: ReturnType<typeof usePartyConnection>,
  fromPlayerId: string,
  signal: { kind: string, sdp?: string, candidate?: string }
) {
  if (signal.kind === 'leave') {
    removePeer(fromPlayerId)
    return
  }
  let st = peerStatesRef.value.get(fromPlayerId)
  if (!st) {
    st = (await createOutgoingPeer(connection, fromPlayerId, true)) ?? undefined
    if (!st) return
  }
  if (signal.kind === 'offer' && signal.sdp) {
    const desc = new RTCSessionDescription(JSON.parse(signal.sdp) as RTCSessionDescriptionInit)
    await st.pc.setRemoteDescription(desc)
    const answer = await st.pc.createAnswer()
    await st.pc.setLocalDescription(answer)
    sendSignal(connection, {
      type: 'voice:answer',
      targetPlayerId: fromPlayerId,
      sdp: JSON.stringify(st.pc.localDescription)
    })
  } else if (signal.kind === 'answer' && signal.sdp) {
    const desc = new RTCSessionDescription(JSON.parse(signal.sdp) as RTCSessionDescriptionInit)
    await st.pc.setRemoteDescription(desc)
  } else if (signal.kind === 'ice' && signal.candidate) {
    const cand = new RTCIceCandidate(JSON.parse(signal.candidate) as RTCIceCandidateInit)
    try {
      await st.pc.addIceCandidate(cand)
    } catch { /* drop stale candidate */ }
  }
}

function removePeer(peerId: string) {
  const st = peerStatesRef.value.get(peerId)
  if (!st) return
  try {
    st.pc.close()
  } catch { /* no-op */ }
  try {
    st.audio.srcObject = null
    st.audio.remove()
  } catch { /* no-op */ }
  const next = new Map(peerStatesRef.value)
  next.delete(peerId)
  peerStatesRef.value = next
  const sp = new Set(speakingPeersRef.value)
  sp.delete(peerId)
  speakingPeersRef.value = sp
}

function teardownAll() {
  for (const id of [...peerStatesRef.value.keys()]) removePeer(id)
  if (localStreamRef.value) {
    for (const t of localStreamRef.value.getTracks()) t.stop()
    localStreamRef.value = null
  }
}

function applyMutes(settings: ReturnType<typeof useSettingsStore>) {
  for (const [peerId, st] of peerStatesRef.value) {
    const muted = settings.voiceMutedPeers.has(peerId)
    const vol = settings.voicePerPeerVolumes[peerId] ?? 1
    st.audio.muted = muted
    st.audio.volume = Math.min(1, Math.max(0, vol))
  }
}

export function useVoiceChat() {
  const connection = usePartyConnection()
  const party = usePartyStore()
  const settings = useSettingsStore()

  function targetPeerIds(): string[] {
    if (!party.me) return []
    if (!settings.voiceEnabled) return []
    const isMasterGlobal = party.me.role === 'master' && settings.masterVoiceScope === 'global'
    return party.players
      .filter(p => p.id !== party.me!.id)
      .filter(p => isMasterGlobal || p.currentAreaId === party.me!.currentAreaId)
      .map(p => p.id)
  }

  async function reconcilePeers() {
    if (!settings.voiceEnabled) {
      for (const peerId of [...peerStatesRef.value.keys()]) {
        sendSignal(connection, { type: 'voice:leave', targetPlayerId: peerId })
      }
      teardownAll()
      return
    }
    const want = new Set(targetPeerIds())
    for (const peerId of [...peerStatesRef.value.keys()]) {
      if (!want.has(peerId)) {
        sendSignal(connection, { type: 'voice:leave', targetPlayerId: peerId })
        removePeer(peerId)
      }
    }
    for (const peerId of want) {
      if (!peerStatesRef.value.has(peerId)) {
        // Tie-breaker: chi ha l'id "minore" avvia l'offer
        const initiator = party.me!.id < peerId
        await createOutgoingPeer(connection, peerId, !initiator)
      }
    }
    applyMutes(settings)
  }

  // Gestione track.enabled in base a voiceEnabled + voiceMode + isTransmitting.
  // continuous: track enabled = voiceEnabled
  // ptt: track enabled = voiceEnabled && isTransmitting
  function refreshTrackEnabled() {
    if (!settings.voiceEnabled) {
      applyTrackEnabled(false)
      return
    }
    if (settings.voiceMode === 'continuous') {
      applyTrackEnabled(true)
    } else {
      applyTrackEnabled(isTransmittingRef.value)
    }
  }

  function startTransmit() {
    if (!settings.voiceEnabled) return
    isTransmittingRef.value = true
    refreshTrackEnabled()
  }
  function stopTransmit() {
    isTransmittingRef.value = false
    refreshTrackEnabled()
  }

  if (!installed) {
    installed = true

    watch(
      () => [
        settings.voiceEnabled,
        settings.masterVoiceScope,
        party.me?.currentAreaId,
        party.players.map(p => `${p.id}:${p.currentAreaId}`).join('|')
      ],
      () => { void reconcilePeers() },
      { immediate: true, flush: 'post' }
    )

    // Sync track.enabled quando cambia mode o voiceEnabled.
    // In PTT, alla disattivazione della voce azzera anche isTransmitting
    // per non lasciare lo stato sospeso.
    watch(
      () => [settings.voiceEnabled, settings.voiceMode],
      () => {
        if (!settings.voiceEnabled) isTransmittingRef.value = false
        refreshTrackEnabled()
      }
    )
    watch(isTransmittingRef, () => {
      refreshTrackEnabled()
    })

    watch(
      () => [settings.voiceMutedPeers.size, JSON.stringify(settings.voicePerPeerVolumes)],
      () => { applyMutes(settings) }
    )

    if (typeof window !== 'undefined') {
      window.addEventListener('gdr:voice-signal', (e: Event) => {
        const detail = (e as CustomEvent<{
          fromPlayerId: string
          signal: { kind: string, sdp?: string, candidate?: string }
        }>).detail
        void handleSignal(connection, detail.fromPlayerId, detail.signal)
      })

      // Listener globali tastiera per push-to-talk: attivi solo quando
      // voiceEnabled E voiceMode === 'ptt'. Ignorano keypress ripetuti
      // (repeat) e input in campi testuali per non interferire con la chat.
      const isTextTarget = (t: EventTarget | null) => {
        if (!t || !(t as HTMLElement).tagName) return false
        const tag = (t as HTMLElement).tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') return true
        if ((t as HTMLElement).isContentEditable) return true
        return false
      }
      window.addEventListener('keydown', (e: KeyboardEvent) => {
        if (!settings.voiceEnabled || settings.voiceMode !== 'ptt') return
        if (e.repeat) return
        if (e.code !== settings.pttKey) return
        if (isTextTarget(e.target)) return
        startTransmit()
      })
      window.addEventListener('keyup', (e: KeyboardEvent) => {
        if (settings.voiceMode !== 'ptt') return
        if (e.code !== settings.pttKey) return
        stopTransmit()
      })
      // Safety: se la finestra perde focus (alt-tab), ferma la trasmissione
      window.addEventListener('blur', () => {
        if (isTransmittingRef.value) stopTransmit()
      })
    }
  }

  return {
    localStream: localStreamRef,
    peers: peerStatesRef,
    speakingPeers: speakingPeersRef,
    error: errorRef,
    isTransmitting: isTransmittingRef,
    isSelfSpeaking: isSelfSpeakingRef,
    startTransmit,
    stopTransmit
  }
}
