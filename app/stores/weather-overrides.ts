import { ref } from 'vue'
import { makeKeyed } from '~/stores/factory'

export interface WeatherOverride { code: string, intensity: number }

function weatherOverridesStoreFactory() {
  // key: areaId | '*'
  const overrides = ref<Record<string, WeatherOverride>>({})

  function hydrate(list: { areaId: string | null, code: string, intensity: number }[]) {
    const next: Record<string, WeatherOverride> = {}
    for (const o of list) {
      next[o.areaId ?? '*'] = { code: o.code, intensity: o.intensity }
    }
    overrides.value = next
  }

  function set(areaId: string | null, override: WeatherOverride | null) {
    const k = areaId ?? '*'
    if (!override) {
      const next = { ...overrides.value }
      const { [k]: _removed, ...rest } = next
      void _removed
      overrides.value = rest
    } else {
      overrides.value = { ...overrides.value, [k]: override }
    }
  }

  function get(areaId: string): WeatherOverride | null {
    return overrides.value[areaId] ?? overrides.value['*'] ?? null
  }

  function reset() {
    overrides.value = {}
  }

  return { overrides, hydrate, set, get, reset }
}

export const useWeatherOverridesStore = makeKeyed('weatherOverrides', weatherOverridesStoreFactory)
