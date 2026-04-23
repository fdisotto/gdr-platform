import type { AreaId } from '~~/shared/map/areas'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

export const WEATHER_CODES = [
  'clear', 'overcast', 'fog', 'rain', 'ashfall', 'redSky', 'storm', 'night'
] as const

export type WeatherCode = typeof WEATHER_CODES[number]

export interface WeatherState {
  code: WeatherCode
  intensity: number
  label: string
}

const LABELS: Record<WeatherCode, string> = {
  clear: 'Cielo limpido',
  overcast: 'Cielo coperto',
  fog: 'Nebbia persistente',
  rain: 'Pioggia sottile',
  ashfall: 'Pioggia di cenere',
  redSky: 'Cielo rosso',
  storm: 'Tempesta',
  night: 'Notte fonda'
}

type Season = 'winter' | 'spring' | 'summer' | 'autumn'
type DayPart = 'day' | 'dusk' | 'night'

function seasonOf(date: Date): Season {
  const m = date.getUTCMonth()
  if (m === 11 || m <= 1) return 'winter'
  if (m <= 4) return 'spring'
  if (m <= 7) return 'summer'
  return 'autumn'
}

function dayPartOf(date: Date): DayPart {
  const h = date.getUTCHours()
  if (h >= 6 && h < 18) return 'day'
  if (h >= 18 && h < 22) return 'dusk'
  return 'night'
}

// Peso base per combinazione stagione+dayPart. Valori più alti = più probabile.
const BASE_WEIGHTS: Record<Season, Record<DayPart, Record<WeatherCode, number>>> = {
  winter: {
    day: { clear: 2, overcast: 4, fog: 4, rain: 1, ashfall: 0, redSky: 0, storm: 0, night: 0 },
    dusk: { clear: 1, overcast: 3, fog: 5, rain: 1, ashfall: 0, redSky: 1, storm: 0, night: 2 },
    night: { clear: 0, overcast: 2, fog: 5, rain: 0, ashfall: 0, redSky: 0, storm: 0, night: 6 }
  },
  spring: {
    day: { clear: 5, overcast: 3, fog: 1, rain: 2, ashfall: 0, redSky: 0, storm: 1, night: 0 },
    dusk: { clear: 3, overcast: 3, fog: 2, rain: 2, ashfall: 0, redSky: 2, storm: 1, night: 1 },
    night: { clear: 1, overcast: 2, fog: 2, rain: 1, ashfall: 0, redSky: 0, storm: 1, night: 5 }
  },
  summer: {
    day: { clear: 4, overcast: 2, fog: 0, rain: 1, ashfall: 2, redSky: 3, storm: 2, night: 0 },
    dusk: { clear: 2, overcast: 2, fog: 0, rain: 1, ashfall: 2, redSky: 4, storm: 2, night: 1 },
    night: { clear: 1, overcast: 1, fog: 1, rain: 1, ashfall: 1, redSky: 1, storm: 1, night: 5 }
  },
  autumn: {
    day: { clear: 2, overcast: 4, fog: 3, rain: 4, ashfall: 1, redSky: 0, storm: 1, night: 0 },
    dusk: { clear: 1, overcast: 3, fog: 4, rain: 3, ashfall: 1, redSky: 1, storm: 1, night: 1 },
    night: { clear: 0, overcast: 2, fog: 4, rain: 2, ashfall: 0, redSky: 0, storm: 0, night: 6 }
  }
}

// Bias moltiplicativi per area.
const AREA_BIAS: Partial<Record<AreaId, Partial<Record<WeatherCode, number>>>> = {
  fogne: { fog: 2.0, overcast: 1.3, clear: 0.5 },
  radio: { clear: 1.5, storm: 1.4, fog: 0.7 },
  porto: { fog: 1.6, rain: 1.3, storm: 1.2 },
  ospedale: { overcast: 1.3 },
  chiesa: { fog: 1.3, redSky: 1.2 },
  rifugio: { night: 1.5, fog: 1.2, clear: 0.5 },
  ponte: { storm: 1.3 }
}

function weightedPick(rng: () => number, weights: Record<string, number>): string {
  const entries = Object.entries(weights).filter(([, w]) => w > 0)
  const total = entries.reduce((acc, [, w]) => acc + w, 0)
  let r = rng() * total
  for (const [k, w] of entries) {
    if ((r -= w) <= 0) return k
  }
  return entries[entries.length - 1]![0]
}

export function computeWeather(seed: string, areaId: AreaId, serverTimeMs: number): WeatherState {
  const date = new Date(serverTimeMs)
  const season = seasonOf(date)
  const part = dayPartOf(date)

  // Slot temporale: cambia ogni 2 ore perché il meteo non "balli" al minuto.
  const slot = Math.floor(date.getTime() / (1000 * 60 * 60 * 2))

  const rng = mulberry32(
    seedFromString(`${seed}|${areaId}|${slot}`)
  )

  const base = { ...BASE_WEIGHTS[season][part] } as Record<string, number>
  const bias = AREA_BIAS[areaId]
  if (bias) {
    for (const [k, mul] of Object.entries(bias)) {
      base[k] = (base[k] ?? 0) * (mul as number)
    }
  }

  const code = weightedPick(rng, base) as WeatherCode
  const intensity = 0.3 + rng() * 0.7
  return { code, intensity: Math.round(intensity * 100) / 100, label: LABELS[code] }
}
