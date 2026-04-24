import { defineStore } from 'pinia'
import { ref } from 'vue'
import { usePartyConnection } from '~/composables/usePartyConnection'

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

export const useMasterToolsStore = defineStore('masterTools', () => {
  const actions = ref<MasterAction[]>([])
  const bans = ref<BanRow[]>([])

  function setActions(list: MasterAction[]) {
    actions.value = list
  }
  function setBans(list: BanRow[]) {
    bans.value = list
  }
  function refresh() {
    const c = usePartyConnection()
    c.send({ type: 'master:fetch-actions', limit: 100 })
    c.send({ type: 'master:fetch-bans' })
  }
  function reset() {
    actions.value = []
    bans.value = []
  }
  return { actions, bans, setActions, setBans, refresh, reset }
})
