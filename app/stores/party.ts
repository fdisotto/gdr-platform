import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface MeSnapshot {
  id: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
}

export interface PartySnapshot {
  seed: string
  cityName: string
  createdAt: number
  lastActivityAt: number
}

export interface PlayerSnapshot {
  id: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
}

export interface AreaStateSnapshot {
  partySeed: string
  areaId: string
  status: 'intact' | 'infested' | 'ruined' | 'closed'
  customName: string | null
  notes: string | null
}

export const usePartyStore = defineStore('party', () => {
  const me = ref<MeSnapshot | null>(null)
  const party = ref<PartySnapshot | null>(null)
  const players = ref<PlayerSnapshot[]>([])
  const areasState = ref<AreaStateSnapshot[]>([])

  function hydrate(payload: {
    me: MeSnapshot, party: PartySnapshot,
    players: PlayerSnapshot[], areasState: AreaStateSnapshot[]
  }) {
    me.value = payload.me
    party.value = payload.party
    players.value = payload.players
    areasState.value = payload.areasState
  }

  function reset() {
    me.value = null
    party.value = null
    players.value = []
    areasState.value = []
  }

  return { me, party, players, areasState, hydrate, reset }
})
