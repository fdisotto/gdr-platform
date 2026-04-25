import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { computeWeather, type WeatherState } from '~~/shared/map/weather'
import type { AreaId } from '~~/shared/map/areas'
import { usePartyStore } from '~/stores/party'
import { useServerTime } from '~/composables/useServerTime'
import { useWeatherOverridesStore } from '~/stores/weather-overrides'
import { usePartySeed } from '~/composables/usePartySeed'

const RECOMPUTE_INTERVAL_MS = 60_000

export function useAreaWeather(areaIdRef: () => AreaId | null) {
  const seed = usePartySeed()
  const party = usePartyStore(seed)
  const serverTime = useServerTime()
  const overridesStore = useWeatherOverridesStore(seed)
  const tick = ref(0)
  let timer: ReturnType<typeof setInterval> | null = null

  onMounted(() => {
    timer = setInterval(() => {
      tick.value++
    }, RECOMPUTE_INTERVAL_MS)
  })

  onBeforeUnmount(() => {
    if (timer) clearInterval(timer)
  })

  // Aggiorna anche quando l'area corrente cambia
  watch(areaIdRef, () => {
    tick.value++
  })

  const weather = computed<WeatherState | null>(() => {
    void tick.value // trigger recompute
    const areaId = areaIdRef()
    const partySeed = party.party?.seed
    if (!areaId || !partySeed) return null
    const ovr = overridesStore.get(areaId)
    if (ovr) {
      return { code: ovr.code as WeatherState['code'], intensity: ovr.intensity, label: ovr.code }
    }
    const now = serverTime.currentTime()
    return computeWeather(partySeed, areaId, now)
  })

  return { weather }
}
