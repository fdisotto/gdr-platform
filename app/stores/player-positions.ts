import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { PlayerPosition } from '~~/shared/protocol/ws'

export const usePlayerPositionsStore = defineStore('playerPositions', () => {
  // key = `${playerId}::${areaId}` → {x, y}
  const positions = ref<Record<string, { x: number, y: number }>>({})

  function key(playerId: string, areaId: string): string {
    return `${playerId}::${areaId}`
  }

  function hydrate(list: PlayerPosition[]) {
    const next: Record<string, { x: number, y: number }> = {}
    for (const p of list) {
      next[key(p.playerId, p.areaId)] = { x: p.x, y: p.y }
    }
    positions.value = next
  }

  function set(playerId: string, areaId: string, x: number | null, y: number | null) {
    const k = key(playerId, areaId)
    if (x === null || y === null) {
      const { [k]: _removed, ...rest } = positions.value
      positions.value = rest
    } else {
      positions.value = { ...positions.value, [k]: { x, y } }
    }
  }

  function resetForPlayer(playerId: string) {
    const next: Record<string, { x: number, y: number }> = {}
    for (const [k, v] of Object.entries(positions.value)) {
      if (!k.startsWith(`${playerId}::`)) next[k] = v
    }
    positions.value = next
  }

  function get(playerId: string, areaId: string): { x: number, y: number } | null {
    return positions.value[key(playerId, areaId)] ?? null
  }

  function reset() {
    positions.value = {}
  }

  return { positions, hydrate, set, get, resetForPlayer, reset }
})
