import { defineStore } from 'pinia'
import { ref } from 'vue'
import type { Zombie } from '~~/shared/protocol/ws'

export const useZombiesStore = defineStore('zombies', () => {
  // Indexed per areaId per lookup veloce
  const byArea = ref<Record<string, Zombie[]>>({})
  // Set di id selezionati (cross-area, ma in pratica solo zombie dell'area corrente)
  const selected = ref<Set<string>>(new Set())

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

  function addBatch(zombies: Zombie[]) {
    const next = { ...byArea.value }
    for (const z of zombies) {
      const arr = next[z.areaId] ?? []
      next[z.areaId] = [...arr, z]
    }
    byArea.value = next
  }

  function move(id: string, x: number, y: number) {
    const next: Record<string, Zombie[]> = {}
    for (const [areaId, arr] of Object.entries(byArea.value)) {
      next[areaId] = arr.map(z => z.id === id ? { ...z, x, y } : z)
    }
    byArea.value = next
  }

  function remove(id: string) {
    const next: Record<string, Zombie[]> = {}
    for (const [areaId, arr] of Object.entries(byArea.value)) {
      const filtered = arr.filter(z => z.id !== id)
      if (filtered.length) next[areaId] = filtered
    }
    byArea.value = next
    selected.value.delete(id)
  }

  function removeMany(ids: string[]) {
    const idSet = new Set(ids)
    const next: Record<string, Zombie[]> = {}
    for (const [areaId, arr] of Object.entries(byArea.value)) {
      const filtered = arr.filter(z => !idSet.has(z.id))
      if (filtered.length) next[areaId] = filtered
    }
    byArea.value = next
    for (const id of ids) selected.value.delete(id)
  }

  function forArea(areaId: string): Zombie[] {
    return byArea.value[areaId] ?? []
  }

  function select(id: string) {
    selected.value = new Set([...selected.value, id])
  }
  function unselect(id: string) {
    const next = new Set(selected.value)
    next.delete(id)
    selected.value = next
  }
  function toggle(id: string) {
    if (selected.value.has(id)) {
      unselect(id)
    } else {
      select(id)
    }
  }
  function selectMany(ids: string[]) {
    selected.value = new Set([...selected.value, ...ids])
  }
  function setSelection(ids: string[]) {
    selected.value = new Set(ids)
  }
  function clearSelection() {
    selected.value = new Set()
  }
  function isSelected(id: string): boolean {
    return selected.value.has(id)
  }

  function reset() {
    byArea.value = {}
    selected.value = new Set()
  }

  return {
    byArea, selected,
    hydrate, add, addBatch, move, remove, removeMany,
    forArea,
    select, unselect, toggle, selectMany, setSelection, clearSelection, isSelected,
    reset
  }
})
