import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'

// Factor 10: bilanciamento sicuro/veloce per login utente. Più alto dei
// master token MVP (factor 8) perché qui è una password con valore.
const BCRYPT_FACTOR = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_FACTOR)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash)
}

// 32 byte random → base64url = 43 char senza padding
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url')
}
