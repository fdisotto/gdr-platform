/**
 * Tipi e contratti per i generatori di mappe procedurali (city, country,
 * wasteland). Lo scope MVP v2d prevede generatori deterministici (seed →
 * GeneratedMap) cacheati per `cacheKey(type, seed, params)`.
 */

export interface GeneratedDecor {
  kind: string
  x: number
  y: number
  w?: number
  h?: number
  points?: string
  props?: Record<string, unknown>
}

export interface GeneratedAreaDetail {
  layout: 'open' | 'building' | 'corridor' | 'crossing'
  width: number
  height: number
  props: GeneratedDecor[]
}

export interface GeneratedAreaShape {
  x: number
  y: number
  w: number
  h: number
  kind: 'rect' | 'polygon'
  points?: string
}

export interface GeneratedArea {
  id: string
  name: string
  shape: GeneratedAreaShape
  edge: boolean
  spawn: boolean
  decor: GeneratedDecor[]
  detail: GeneratedAreaDetail
}

export type GeneratedBackground
  = | { kind: 'gradient', from: string, to: string }
    | { kind: 'noise', baseColor: string, density: number }

export interface GeneratedMap {
  areas: GeneratedArea[]
  adjacency: Record<string, string[]>
  spawnAreaId: string
  edgeAreaIds: string[]
  background: GeneratedBackground
}

export type GenParams = Record<string, unknown>

export type GeneratorFn = (seed: string, params: GenParams) => GeneratedMap

/**
 * Serializza i params in modo stabile rispetto all'ordine delle chiavi.
 * Implementazione "flat": ordina solo le chiavi top-level. I generatori
 * MVP usano param flat (density, forestRatio, riverChance, ruinRatio,
 * craterCount); estendere a struct annidate solo quando servirà.
 */
function stableStringify(params: GenParams): string {
  const keys = Object.keys(params).sort()
  const ordered: Record<string, unknown> = {}
  for (const k of keys) {
    ordered[k] = params[k]
  }
  return JSON.stringify(ordered)
}

/**
 * Chiave di cache deterministica per (type, seed, params).
 * Stesso input → stessa chiave, indipendente dall'ordine di inserimento
 * delle chiavi del dict params.
 */
export function cacheKey(type: string, seed: string, params: GenParams): string {
  return `${type}:${seed}:${stableStringify(params)}`
}
