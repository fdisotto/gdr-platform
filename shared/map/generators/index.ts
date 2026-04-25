/**
 * Registry centrale dei generatori di mappe procedurali e cache deterministica.
 *
 * Routing puro `typeId → GeneratorFn` + memoization su `cacheKey(type, seed,
 * params)`. La cache vive in memoria del processo (dev server / test). Il
 * reset è esposto solo per i test e per scenari di rigenerazione esplicita.
 */

import { DomainError } from '~~/shared/errors'
import { city } from './city'
import { country } from './country'
import type { GeneratedMap, GenParams, GeneratorFn } from './types'
import { cacheKey } from './types'
import { wasteland } from './wasteland'

export const GENERATORS: Record<string, GeneratorFn> = {
  city,
  country,
  wasteland
}

const cache = new Map<string, GeneratedMap>()

export function generate(typeId: string, seed: string, params: GenParams): GeneratedMap {
  const key = cacheKey(typeId, seed, params)
  const cached = cache.get(key)
  if (cached) return cached
  const fn = GENERATORS[typeId]
  if (!fn) throw new DomainError('map_type_not_found', typeId)
  const map = fn(seed, params)
  cache.set(key, map)
  return map
}

export function _resetGeneratorCache(): void {
  cache.clear()
}

export type {
  GeneratedArea,
  GeneratedAreaDetail,
  GeneratedBackground,
  GeneratedDecor,
  GeneratedMap,
  GeneratorFn,
  GenParams
} from './types'
