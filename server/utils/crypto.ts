import { randomBytes, randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'

const BCRYPT_COST = 8

export function generateToken(bytes = 32): string {
  return randomBytes(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

export function generateUuid(): string {
  return randomUUID()
}

export async function hashMasterToken(token: string): Promise<string> {
  return bcrypt.hash(token, BCRYPT_COST)
}

export async function verifyMasterToken(token: string, hash: string): Promise<boolean> {
  return bcrypt.compare(token, hash)
}
