import { AREAS, type AreaId } from '~~/shared/map/areas'
import { mulberry32, seedFromString } from '~~/shared/seed/prng'

export type AreaStatus = 'intact' | 'infested' | 'ruined' | 'closed'

export interface AreaInitialState {
  status: AreaStatus
  customName: string | null
}

export interface CityState {
  cityName: string
  areas: Record<AreaId, AreaInitialState>
}

// Nomi città reali italiane (mix di metropoli e capoluoghi). Combinati
// con un suffisso post-apocalittico danno l'effetto "città reale dopo
// l'evento" senza inventare toponimi.
const CITY_NAMES = [
  'Milano', 'Roma', 'Napoli', 'Torino', 'Bologna',
  'Firenze', 'Genova', 'Venezia', 'Verona', 'Padova',
  'Trieste', 'Bari', 'Palermo', 'Catania', 'Cagliari',
  'Brescia', 'Bergamo', 'Modena', 'Parma', 'Reggio Emilia',
  'Pavia', 'Como', 'Lecco', 'Treviso', 'Vicenza',
  'Pisa', 'Livorno', 'Lucca', 'Siena', 'Perugia',
  'Ancona', 'Pescara', 'Foggia', 'Lecce', 'Salerno',
  'Cosenza', 'Reggio Calabria', 'Messina', 'Trapani', 'Sassari'
]

const CITY_SUFFIXES = ['— Quarantena', '— Zona 3', '— Settore C', '— Focolaio 7', '']

const AREA_NAME_VARIANTS: Partial<Record<AreaId, string[]>> = {
  piazza: ['Piazza del Mercato', 'Piazza dei Martiri', 'Piazza Grande'],
  giardino: ['Parco dei Caduti', 'Orto Abbandonato', 'Giardino delle Statue'],
  supermercato: ['Alimentari Lucia', 'Discount Stella', 'Centro Spesa'],
  ospedale: ['Clinica San Giuda', 'Ambulatorio Nord', 'Pronto Soccorso'],
  chiesa: ['Chiesa di Santa Morte', 'Duomo Vecchio', 'Cappella del Sangue'],
  polizia: ['Caserma Alfa', 'Posto di Blocco', 'Comando Locale'],
  scuola: ['Liceo Dante', 'Elementari Manzoni', 'Istituto Tecnico'],
  rifugio: ['Bunker 47', 'Rifugio Militare', 'Sotterraneo'],
  benzinaio: ['Esso Abbandonato', 'Stazione Q8', 'Pompa Rossa'],
  case: ['Quartiere Est', 'Vicolo dei Gatti', 'Condominio Alto'],
  fogne: ['Galleria Pluviale', 'Collettore Sud', 'Condotto Nero'],
  porto: ['Darsena', 'Molo Vecchio', 'Scali Est'],
  radio: ['Stazione Radio 104', 'Antenna Mastodonte', 'Ripetitore'],
  ponte: ['Ponte della Morte', 'Viadotto Crollato', 'Passerella']
}

function pick<T>(rng: () => number, list: readonly T[]): T {
  return list[Math.floor(rng() * list.length)]!
}

function pickStatus(rng: () => number): AreaStatus {
  const r = rng()
  if (r < 0.40) return 'intact'
  if (r < 0.75) return 'infested'
  if (r < 0.95) return 'ruined'
  return 'closed'
}

export function deriveCityState(seed: string): CityState {
  const baseSeed = seedFromString(seed)
  const rng = mulberry32(baseSeed)

  const name = pick(rng, CITY_NAMES)
  const suffix = pick(rng, CITY_SUFFIXES)
  const cityName = suffix ? `${name} ${suffix}` : name

  const areas = {} as Record<AreaId, AreaInitialState>
  for (const area of AREAS) {
    const status: AreaStatus = area.id === 'piazza' ? 'intact' : pickStatus(rng)
    const variants = AREA_NAME_VARIANTS[area.id]
    const customName = variants && rng() < 0.30 ? pick(rng, variants) : null
    areas[area.id] = { status, customName }
  }

  return { cityName, areas }
}
