// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'
import { ref } from 'vue'
import GameMap from '~/components/map/GameMap.vue'
import type { GeneratedMap } from '~~/shared/map/generators/types'

// Stub composables di rete + route per isolare il rendering del solo
// componente. Il test verifica che `:generated-map` pilota i v-for sopra
// `MapArea` (numero di stub == numero di aree della GeneratedMap).
vi.mock('~/composables/usePartySeed', () => ({
  usePartySeed: () => 'test-seed'
}))
vi.mock('~/composables/usePartyConnections', () => ({
  usePartyConnections: () => ({
    open: () => ({ send: vi.fn() }),
    close: vi.fn(),
    closeAll: vi.fn(),
    list: () => [],
    get: () => null
  })
}))
vi.mock('~/composables/useAreaWeather', () => ({
  useAreaWeather: () => ({ weather: ref(null) })
}))

function fakeGeneratedMap(): GeneratedMap {
  return {
    areas: [
      {
        id: 'a1',
        name: 'Alfa',
        shape: { x: 0, y: 0, w: 100, h: 100, kind: 'rect' },
        edge: false,
        spawn: true,
        decor: [],
        detail: { layout: 'open', width: 800, height: 600, props: [] }
      },
      {
        id: 'a2',
        name: 'Bravo',
        shape: { x: 200, y: 0, w: 100, h: 100, kind: 'rect' },
        edge: false,
        spawn: false,
        decor: [],
        detail: { layout: 'open', width: 800, height: 600, props: [] }
      },
      {
        id: 'a3',
        name: 'Charlie',
        shape: { x: 400, y: 0, w: 100, h: 100, kind: 'rect' },
        edge: true,
        spawn: false,
        decor: [],
        detail: { layout: 'open', width: 800, height: 600, props: [] }
      }
    ],
    adjacency: {
      a1: ['a2'],
      a2: ['a1', 'a3'],
      a3: ['a2']
    },
    spawnAreaId: 'a1',
    edgeAreaIds: ['a3'],
    background: { kind: 'gradient', from: '#0a0a0a', to: '#1a1a1a' }
  }
}

describe('GameMap con generatedMap', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('renderizza N MapArea pari al numero di aree del GeneratedMap', () => {
    const wrapper = mount(GameMap, {
      props: { generatedMap: fakeGeneratedMap() },
      global: {
        stubs: {
          MapArea: { template: '<g class="ma-stub" />', props: ['area', 'state', 'isCurrent', 'isAdjacent', 'isMaster', 'playerCount'] },
          MapAvatar: true,
          MapWeatherOverlay: true,
          MapLegend: true,
          MapPlayersBox: true,
          MapRoads: true,
          MapDecor: true,
          UIcon: true
        },
        mocks: {
          $route: { params: { seed: 'test-seed' } }
        }
      }
    })
    expect(wrapper.findAll('.ma-stub').length).toBe(3)
  })

  it('senza generatedMap renderizza le 14 aree legacy', () => {
    const wrapper = mount(GameMap, {
      props: {},
      global: {
        stubs: {
          MapArea: { template: '<g class="ma-stub" />', props: ['area', 'state', 'isCurrent', 'isAdjacent', 'isMaster', 'playerCount'] },
          MapAvatar: true,
          MapWeatherOverlay: true,
          MapLegend: true,
          MapPlayersBox: true,
          MapRoads: true,
          MapDecor: true,
          UIcon: true
        },
        mocks: {
          $route: { params: { seed: 'test-seed' } }
        }
      }
    })
    expect(wrapper.findAll('.ma-stub').length).toBe(14)
  })
})
