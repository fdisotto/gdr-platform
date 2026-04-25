import { ref } from 'vue'
import { makeKeyed } from '~/stores/factory'
import type { PartyMapPublic, TransitionPublic } from '~~/shared/protocol/ws'

export interface MeSnapshot {
  id: string
  nickname: string
  role: 'user' | 'master'
  currentAreaId: string
  // v2d (T19): mappa corrente del player. Optional per backward compat
  // con server pre-T15 e con stato pre-multi-mappa.
  currentMapId?: string | null
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

function partyStoreFactory() {
  const me = ref<MeSnapshot | null>(null)
  const party = ref<PartySnapshot | null>(null)
  const players = ref<PlayerSnapshot[]>([])
  const areasState = ref<AreaStateSnapshot[]>([])
  // v2d multi-mappa (T19, anticipo da T27): popolati dal payload state:init
  // quando T27 collegherà i campi al WS.
  const maps = ref<PartyMapPublic[]>([])
  const transitions = ref<TransitionPublic[]>([])
  const currentMapId = ref<string | null>(null)

  function hydrate(payload: {
    me: MeSnapshot
    party: PartySnapshot
    players: PlayerSnapshot[]
    areasState: AreaStateSnapshot[]
    maps?: PartyMapPublic[]
    transitions?: TransitionPublic[]
    currentMapId?: string | null
  }) {
    me.value = payload.me
    party.value = payload.party
    players.value = payload.players
    areasState.value = payload.areasState
    maps.value = payload.maps ?? []
    transitions.value = payload.transitions ?? []
    currentMapId.value = payload.currentMapId ?? payload.me.currentMapId ?? null
  }

  function reset() {
    me.value = null
    party.value = null
    players.value = []
    areasState.value = []
    maps.value = []
    transitions.value = []
    currentMapId.value = null
  }

  return {
    me, party, players, areasState,
    maps, transitions, currentMapId,
    hydrate, reset
  }
}

export const usePartyStore = makeKeyed('party', partyStoreFactory)
