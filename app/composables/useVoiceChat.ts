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
let audioContextForVad: AudioContext | null = null

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
    localStreamRef.value = stream
    return stream
  } catch (e) {
    errorRef.value = (e as Error).message ?? 'getUserMedia failed'
    return null
  }
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
    }
  }

  return {
    localStream: localStreamRef,
    peers: peerStatesRef,
    speakingPeers: speakingPeersRef,
    error: errorRef
  }
}
