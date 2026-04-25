// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { usePartyStore } from '~/stores/party'
import { usePartyMaps } from '~/composables/usePartyMaps'

describe('usePartyMaps', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('activeMap, spawnMap e transitionsForActiveMap derivano dallo store', () => {
    const seed = 'abc'
    const store = usePartyStore(seed)
    store.hydrate({
      me: {
        id: 'p1',
        nickname: 'a',
        role: 'user',
        currentAreaId: 'x',
        currentMapId: 'm1'
      },
      party: { seed, cityName: 'Test', createdAt: 0, lastActivityAt: 0 },
      players: [],
      areasState: [],
      maps: [
        { id: 'm1', mapTypeId: 'city', name: 'A', isSpawn: true, createdAt: 0 },
        { id: 'm2', mapTypeId: 'country', name: 'B', isSpawn: false, createdAt: 0 }
      ],
      transitions: [
        { id: 't1', fromMapId: 'm1', fromAreaId: 'x', toMapId: 'm2', toAreaId: 'y', label: null },
        { id: 't2', fromMapId: 'm2', fromAreaId: 'y', toMapId: 'm1', toAreaId: 'x', label: null }
      ]
    })
    const { activeMap, spawnMap, transitionsForActiveMap, maps } = usePartyMaps(seed)
    expect(maps.value.length).toBe(2)
    expect(activeMap.value?.id).toBe('m1')
    expect(spawnMap.value?.id).toBe('m1')
    expect(transitionsForActiveMap.value.length).toBe(1)
    expect(transitionsForActiveMap.value[0]!.id).toBe('t1')
  })

  it('activeMap si aggiorna quando currentMapId cambia', () => {
    const seed = 'def'
    const store = usePartyStore(seed)
    store.hydrate({
      me: {
        id: 'p1',
        nickname: 'a',
        role: 'user',
        currentAreaId: 'x',
        currentMapId: 'm1'
      },
      party: { seed, cityName: 'Test', createdAt: 0, lastActivityAt: 0 },
      players: [],
      areasState: [],
      maps: [
        { id: 'm1', mapTypeId: 'city', name: 'A', isSpawn: true, createdAt: 0 },
        { id: 'm2', mapTypeId: 'country', name: 'B', isSpawn: false, createdAt: 0 }
      ],
      transitions: []
    })
    const { activeMap } = usePartyMaps(seed)
    expect(activeMap.value?.id).toBe('m1')
    store.currentMapId = 'm2'
    expect(activeMap.value?.id).toBe('m2')
  })

  it('default a vuoto se hydrate non fornisce maps/transitions', () => {
    const seed = 'ghi'
    const store = usePartyStore(seed)
    store.hydrate({
      me: { id: 'p1', nickname: 'a', role: 'user', currentAreaId: 'x' },
      party: { seed, cityName: 'Test', createdAt: 0, lastActivityAt: 0 },
      players: [],
      areasState: []
    })
    const { maps, transitions, activeMap, spawnMap, currentMapId } = usePartyMaps(seed)
    expect(maps.value).toEqual([])
    expect(transitions.value).toEqual([])
    expect(activeMap.value).toBeNull()
    expect(spawnMap.value).toBeNull()
    expect(currentMapId.value).toBeNull()
  })

  it('reset svuota tutti i campi multi-mappa', () => {
    const seed = 'jkl'
    const store = usePartyStore(seed)
    store.hydrate({
      me: {
        id: 'p1',
        nickname: 'a',
        role: 'user',
        currentAreaId: 'x',
        currentMapId: 'm1'
      },
      party: { seed, cityName: 'Test', createdAt: 0, lastActivityAt: 0 },
      players: [],
      areasState: [],
      maps: [
        { id: 'm1', mapTypeId: 'city', name: 'A', isSpawn: true, createdAt: 0 }
      ],
      transitions: [
        { id: 't1', fromMapId: 'm1', fromAreaId: 'x', toMapId: 'm1', toAreaId: 'y', label: null }
      ]
    })
    expect(store.maps.length).toBe(1)
    store.reset()
    expect(store.maps).toEqual([])
    expect(store.transitions).toEqual([])
    expect(store.currentMapId).toBeNull()
  })
})
