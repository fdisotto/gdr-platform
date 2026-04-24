import { describe, it, expect } from 'vitest'
import { RegisterBody, LoginBody, ChangePasswordBody, MeResponse } from '~~/shared/protocol/http'

describe('auth http schemas', () => {
  describe('RegisterBody', () => {
    it('accetta username e password validi', () => {
      expect(RegisterBody.parse({ username: 'mash', password: '12345678' })).toEqual({
        username: 'mash', password: '12345678'
      })
    })
    it('rifiuta username con spazi', () => {
      expect(() => RegisterBody.parse({ username: 'm a s h', password: '12345678' })).toThrow()
    })
    it('rifiuta username troppo corto', () => {
      expect(() => RegisterBody.parse({ username: 'ab', password: '12345678' })).toThrow()
    })
    it('rifiuta password troppo corta (<8)', () => {
      expect(() => RegisterBody.parse({ username: 'mash', password: '1234567' })).toThrow()
    })
    it('accetta username con - e _', () => {
      expect(RegisterBody.parse({ username: 'my_user-01', password: '12345678' })).toBeTruthy()
    })
  })

  describe('LoginBody', () => {
    it('permette password qualsiasi non vuota', () => {
      expect(LoginBody.parse({ username: 'mash', password: 'x' })).toBeTruthy()
    })
    it('rifiuta password vuota', () => {
      expect(() => LoginBody.parse({ username: 'mash', password: '' })).toThrow()
    })
  })

  describe('ChangePasswordBody', () => {
    it('richiede entrambi i campi', () => {
      expect(() => ChangePasswordBody.parse({ currentPassword: 'x' })).toThrow()
      expect(() => ChangePasswordBody.parse({ newPassword: 'newpass12' })).toThrow()
    })
    it('newPassword deve rispettare min 8', () => {
      expect(() => ChangePasswordBody.parse({ currentPassword: 'x', newPassword: '1234567' })).toThrow()
    })
    it('accetta coppia valida', () => {
      expect(ChangePasswordBody.parse({ currentPassword: 'old', newPassword: 'newpass12' })).toBeTruthy()
    })
  })

  describe('MeResponse', () => {
    it('accetta kind user', () => {
      expect(MeResponse.parse({ kind: 'user', id: 'u1', username: 'Mash', mustReset: false })).toBeTruthy()
    })
    it('accetta kind superadmin', () => {
      expect(MeResponse.parse({ kind: 'superadmin', id: 's1', username: 'admin', mustReset: true })).toBeTruthy()
    })
    it('rifiuta kind non valido', () => {
      expect(() => MeResponse.parse({ kind: 'other', id: 'x', username: 'y', mustReset: false })).toThrow()
    })
  })
})
