// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { mount } from '@vue/test-utils'

// Stub di pixi.js: l'obiettivo del test è verificare che il mount/unmount del
// componente non esploda. Non vogliamo dipendere dal canvas reale né dalle
// API di Pixi — solo che le interazioni base con stage/Application/Graphics
// non lancino. Pattern allineato a use-pixi-app.test.ts.
vi.mock('pixi.js', () => {
  class FakeGraphics {
    eventMode = ''
    cursor = ''
    rect() { return this }
    poly() { return this }
    circle() { return this }
    fill() { return this }
    stroke() { return this }
    on = vi.fn()
  }
  class FakeText {
    x = 0
    y = 0
    width = 0
    height = 0
  }
  return {
    Application: class {
      canvas = document.createElement('canvas')
      stage = {
        addChild: vi.fn(),
        removeChildren: vi.fn(),
        x: 0,
        y: 0,
        scale: { x: 1, y: 1, set: vi.fn() }
      }

      screen = { width: 800, height: 600 }
      init = vi.fn().mockResolvedValue(undefined)
      destroy = vi.fn()
    },
    Graphics: FakeGraphics,
    Text: FakeText
  }
})

vi.mock('~/composables/usePartySeed', () => ({
  usePartySeed: () => 'test-seed'
}))

describe('MapViewPixi', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('mount con map=null non esplode e poi unmount pulisce', async () => {
    const { default: MapViewPixi } = await import('~/components/map/MapViewPixi.vue')
    const wrapper = mount(MapViewPixi, {
      props: { map: null },
      attachTo: document.body,
      global: {
        mocks: {
          $route: { params: { seed: 'test-seed' } }
        }
      }
    })
    // Lascia girare il microtask del lazy import di pixi.js + init.
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })

  it('mount con map valida non esplode', async () => {
    const { default: MapViewPixi } = await import('~/components/map/MapViewPixi.vue')
    const wrapper = mount(MapViewPixi, {
      props: {
        map: {
          id: 'm1',
          mapTypeId: 'city',
          mapSeed: 'test-seed-1',
          params: {},
          name: 'Test',
          isSpawn: true,
          createdAt: 0
        }
      },
      attachTo: document.body,
      global: {
        mocks: {
          $route: { params: { seed: 'test-seed' } }
        }
      }
    })
    await new Promise(r => setTimeout(r, 0))
    expect(wrapper.exists()).toBe(true)
    wrapper.unmount()
  })
})
