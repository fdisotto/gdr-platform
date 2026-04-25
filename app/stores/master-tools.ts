import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePartyConnections } from '~/composables/usePartyConnections'

interface MasterAction {
  id: string
  partySeed: string
  masterId: string
  action: string
  target: string | null
  payload: string | null
  createdAt: number
}

interface BanRow {
  partySeed: string
  nicknameLower: string
  reason: string | null
  bannedAt: number
}

function masterToolsStoreFactory(seed: string) {
  const actions = ref<MasterAction[]>([])
  const bans = ref<BanRow[]>([])

  function setActions(list: MasterAction[]) {
    actions.value = list
  }
  function setBans(list: BanRow[]) {
    bans.value = list
  }
  function refresh() {
    // refresh chiama il factory direttamente con la seed dello store
    // (lo store è keyed, quindi conosce la propria party).
    const c = usePartyConnections().get(seed)
    if (!c) return
    c.send({ type: 'master:fetch-actions', limit: 100 })
    c.send({ type: 'master:fetch-bans' })
  }
  function reset() {
    actions.value = []
    bans.value = []
  }
  return { actions, bans, setActions, setBans, refresh, reset }
}

// Versione keyed con `seed` propagato in closure al setup-store: il
// `refresh()` ha bisogno del seed per recuperare la connection giusta,
// quindi non possiamo usare `makeKeyed` generico (che riceve un factory
// senza argomenti).
const _defs = new Map<string, ReturnType<typeof defineStore>>()
export function useMasterToolsStore(seed: string) {
  const id = `masterTools-${seed}`
  let useStore = _defs.get(id)
  if (!useStore) {
    useStore = defineStore(id, () => masterToolsStoreFactory(seed)) as unknown as ReturnType<typeof defineStore>
    _defs.set(id, useStore)
  }
  return (useStore as unknown as () => ReturnType<typeof masterToolsStoreFactory>)()
}
