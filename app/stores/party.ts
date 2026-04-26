import { ref } from 'vue'
import { makeKeyed } from '~/stores/factory'
import type {
  PartyMapPublic, TransitionPublic, AreaOverridePublic, AdjacencyOverridePublic
} from '~~/shared/protocol/ws'

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
  // v2d-edit: override master sulle aree per ogni mappa.
  const areaOverrides = ref<AreaOverridePublic[]>([])
  // v2d-edit: delta sul grafo adjacency.
  const adjacencyOverrides = ref<AdjacencyOverridePublic[]>([])

  function hydrate(payload: {
    me: MeSnapshot
    party: PartySnapshot
    players: PlayerSnapshot[]
    areasState: AreaStateSnapshot[]
    maps?: PartyMapPublic[]
    transitions?: TransitionPublic[]
    currentMapId?: string | null
    areaOverrides?: AreaOverridePublic[]
    adjacencyOverrides?: AdjacencyOverridePublic[]
  }) {
    me.value = payload.me
    party.value = payload.party
    players.value = payload.players
    areasState.value = payload.areasState
    maps.value = payload.maps ?? []
    transitions.value = payload.transitions ?? []
    currentMapId.value = payload.currentMapId ?? payload.me.currentMapId ?? null
    areaOverrides.value = payload.areaOverrides ?? []
    adjacencyOverrides.value = payload.adjacencyOverrides ?? []
  }

  function reset() {
    me.value = null
    party.value = null
    players.value = []
    areasState.value = []
    maps.value = []
    transitions.value = []
    currentMapId.value = null
    areaOverrides.value = []
    adjacencyOverrides.value = []
  }

  function applyOverride(o: AreaOverridePublic) {
    const idx = areaOverrides.value.findIndex(
      x => x.mapId === o.mapId && x.areaId === o.areaId
    )
    if (idx === -1) areaOverrides.value = [...areaOverrides.value, o]
    else {
      const copy = [...areaOverrides.value]
      copy[idx] = o
      areaOverrides.value = copy
    }
  }

  function removeOverride(mapId: string, areaId: string) {
    areaOverrides.value = areaOverrides.value.filter(
      x => !(x.mapId === mapId && x.areaId === areaId)
    )
  }

  function applyAdjacencyOverride(o: AdjacencyOverridePublic) {
    const idx = adjacencyOverrides.value.findIndex(
      x => x.mapId === o.mapId && x.areaA === o.areaA && x.areaB === o.areaB
    )
    if (idx === -1) adjacencyOverrides.value = [...adjacencyOverrides.value, o]
    else {
      const copy = [...adjacencyOverrides.value]
      copy[idx] = o
      adjacencyOverrides.value = copy
    }
  }

  function removeAdjacencyOverride(mapId: string, areaA: string, areaB: string) {
    adjacencyOverrides.value = adjacencyOverrides.value.filter(
      x => !(x.mapId === mapId && x.areaA === areaA && x.areaB === areaB)
    )
  }

  return {
    me, party, players, areasState,
    maps, transitions, currentMapId,
    areaOverrides, adjacencyOverrides,
    hydrate, reset,
    applyOverride, removeOverride,
    applyAdjacencyOverride, removeAdjacencyOverride
  }
}

export const usePartyStore = makeKeyed('party', partyStoreFactory)
