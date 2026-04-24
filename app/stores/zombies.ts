import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Zombie } from '~~/shared/protocol/ws'

export const useZombiesStore = defineStore('zombies', () => {
  // Indexed per areaId per lookup veloce
  const byArea = ref<Record<string, Zombie[]>>({})

  function hydrate(zombies: Zombie[]) {
    const next: Record<string, Zombie[]> = {}
    for (const z of zombies) {
      if (!next[z.areaId]) next[z.areaId] = []
      next[z.areaId]!.push(z)
    }
    byArea.value = next
  }

  function add(z: Zombie) {
    const arr = byArea.value[z.areaId] ?? []
    byArea.value = { ...byArea.value, [z.areaId]: [...arr, z] }
  }

  function remove(id: string) {
    const next: Record<string, Zombie[]> = {}
    for (const [areaId, arr] of Object.entries(byArea.value)) {
      const filtered = arr.filter(z => z.id !== id)
      if (filtered.length) next[areaId] = filtered
    }
    byArea.value = next
  }

  function forArea(areaId: string): Zombie[] {
    return byArea.value[areaId] ?? []
  }

  function reset() {
    byArea.value = {}
  }

  return { byArea, hydrate, add, remove, forArea, reset }
})
