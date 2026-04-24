import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { computeWeather, type WeatherState } from '~~/shared/map/weather'
import type { AreaId } from '~~/shared/map/areas'
import { usePartyStore } from '~/stores/party'
import { useServerTime } from '~/composables/useServerTime'
import { useWeatherOverridesStore } from '~/stores/weather-overrides'

const RECOMPUTE_INTERVAL_MS = 60_000

export function useAreaWeather(areaIdRef: () => AreaId | null) {
  const party = usePartyStore()
  const serverTime = useServerTime()
  const overridesStore = useWeatherOverridesStore()
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
    const seed = party.party?.seed
    if (!areaId || !seed) return null
    const ovr = overridesStore.get(areaId)
    if (ovr) {
      return { code: ovr.code as WeatherState['code'], intensity: ovr.intensity, label: ovr.code }
    }
    const now = serverTime.currentTime()
    return computeWeather(seed, areaId, now)
  })

  return { weather }
}
