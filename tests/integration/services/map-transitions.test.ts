import { describe, it, expect, beforeEach } from 'vitest'
import { createTestDb, type Db } from '~~/server/db/client'
import { createParty } from '~~/server/services/parties'
import { createPartyMap, type PartyMapRow } from '~~/server/services/party-maps'
import {
  listTransitionsForMap,
  listTransitionsToMap,
  findTransition,
  createTransition,
  deleteTransition
} from '~~/server/services/map-transitions'
import { findMapType, parseDefaultParams } from '~~/server/services/map-types'
import { generate, _resetGeneratorCache } from '~~/shared/map/generators'
import { invalidateCache } from '~~/server/services/system-settings'
import { createApprovedUser } from '~~/tests/integration/helpers/test-user'

let db: Db
let seed: string
let masterUserId: string
let fromMap: PartyMapRow
let toMap: PartyMapRow
let fromAreaId: string
let toAreaId: string

async function buildSetup() {
  invalidateCache()
  _resetGeneratorCache()
  db = createTestDb()
  masterUserId = await createApprovedUser(db, 'master')
  const r = await createParty(db, { userId: masterUserId, displayName: 'Master' })
  seed = r.seed
  fromMap = createPartyMap(db, { partySeed: seed, mapTypeId: 'city', name: 'Citta1' })
  toMap = createPartyMap(db, { partySeed: seed, mapTypeId: 'country', name: 'Camp1' })
  const cityType = findMapType(db, 'city')!
  const countryType = findMapType(db, 'country')!
  const fromGm = generate('city', fromMap.mapSeed, parseDefaultParams(cityType))
  const toGm = generate('country', toMap.mapSeed, parseDefaultParams(countryType))
  fromAreaId = fromGm.areas[0]!.id
  toAreaId = toGm.areas[0]!.id
}

beforeEach(async () => {
  await buildSetup()
})

describe('map-transitions service', () => {
  it('listTransitionsForMap su mappa senza transizioni ritorna array vuoto', () => {
    expect(listTransitionsForMap(db, fromMap.id)).toEqual([])
  })

  it('createTransition non-bidirectional crea una sola riga', () => {
    const rows = createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId,
      bidirectional: false
    })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.fromMapId).toBe(fromMap.id)
    expect(rows[0]!.toMapId).toBe(toMap.id)
    expect(rows[0]!.partySeed).toBe(seed)
  })

  it('createTransition default bidirectional crea due righe speculari', () => {
    const rows = createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId,
      label: 'cancello nord'
    })
    expect(rows).toHaveLength(2)
    const direct = rows.find(r => r.fromMapId === fromMap.id)!
    const reverse = rows.find(r => r.fromMapId === toMap.id)!
    expect(direct.toMapId).toBe(toMap.id)
    expect(direct.fromAreaId).toBe(fromAreaId)
    expect(direct.toAreaId).toBe(toAreaId)
    expect(reverse.fromMapId).toBe(toMap.id)
    expect(reverse.toMapId).toBe(fromMap.id)
    expect(reverse.fromAreaId).toBe(toAreaId)
    expect(reverse.toAreaId).toBe(fromAreaId)
    expect(direct.label).toBe('cancello nord')
    expect(reverse.label).toBe('cancello nord')
  })

  it('findTransition ritorna la riga giusta su tupla esatta', () => {
    createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId,
      bidirectional: false
    })
    const t = findTransition(db, fromMap.id, fromAreaId, toMap.id, toAreaId)
    expect(t).not.toBeNull()
    expect(t!.fromMapId).toBe(fromMap.id)
    expect(t!.toAreaId).toBe(toAreaId)
    expect(findTransition(db, toMap.id, toAreaId, fromMap.id, fromAreaId)).toBeNull()
  })

  it('listTransitionsForMap ritorna le righe outgoing della mappa', () => {
    createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId
    })
    const outgoing = listTransitionsForMap(db, fromMap.id)
    expect(outgoing).toHaveLength(1)
    expect(outgoing[0]!.fromMapId).toBe(fromMap.id)
    expect(outgoing[0]!.toMapId).toBe(toMap.id)
  })

  it('listTransitionsToMap ritorna le righe incoming (incluso speculare)', () => {
    createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId
    })
    const incoming = listTransitionsToMap(db, fromMap.id)
    expect(incoming).toHaveLength(1)
    expect(incoming[0]!.fromMapId).toBe(toMap.id)
    expect(incoming[0]!.toMapId).toBe(fromMap.id)
  })

  it('createTransition con fromMapId di altra party → not_found', async () => {
    const otherUser = await createApprovedUser(db, 'other')
    const otherParty = await createParty(db, { userId: otherUser, displayName: 'Other' })
    const otherMap = createPartyMap(db, {
      partySeed: otherParty.seed, mapTypeId: 'city', name: 'Altrove'
    })
    expect(() => createTransition(db, {
      partySeed: seed,
      fromMapId: otherMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId
    })).toThrowError(/not_found/)
  })

  it('createTransition con fromAreaId inesistente → transition_invalid', () => {
    expect(() => createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId: 'area-che-non-esiste',
      toMapId: toMap.id,
      toAreaId
    })).toThrowError(/transition_invalid/)
  })

  it('createTransition con toAreaId inesistente → transition_invalid', () => {
    expect(() => createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId: 'area-che-non-esiste'
    })).toThrowError(/transition_invalid/)
  })

  it('deleteTransition di transition con speculare cancella entrambe', () => {
    const rows = createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId
    })
    const direct = rows.find(r => r.fromMapId === fromMap.id)!
    deleteTransition(db, direct.id)
    expect(listTransitionsForMap(db, fromMap.id)).toEqual([])
    expect(listTransitionsForMap(db, toMap.id)).toEqual([])
  })

  it('deleteTransition di transition senza speculare cancella solo quella', () => {
    const rows = createTransition(db, {
      partySeed: seed,
      fromMapId: fromMap.id,
      fromAreaId,
      toMapId: toMap.id,
      toAreaId,
      bidirectional: false
    })
    deleteTransition(db, rows[0]!.id)
    expect(listTransitionsForMap(db, fromMap.id)).toEqual([])
  })

  it('deleteTransition di id inesistente → not_found', () => {
    expect(() => deleteTransition(db, 'unknown')).toThrowError(/not_found/)
  })
})
