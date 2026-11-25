/**
 * Invite codes: generate, clean up what a user typed, and check the shape.
 *
 * Used by the server (createCrew/joinCrew) and the browser (the join form),
 * so it has no server-only imports.
 */

import { INVITE_CODE_LENGTH } from '../schemas/crews-schema'

/**
 * 31 characters with the look-alikes removed: no 0/O, no 1/I/L.
 * 31^8 ≈ 852 billion possible codes.
 */
export const INVITE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** A function that returns `n` random bytes. Swappable in tests. */
export type RandomBytes = (n: number) => Uint8Array

const cryptoRandomBytes: RandomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))

/**
 * Make a new random invite code, e.g. "K7MPQ2XR".
 *
 * Each random byte is 0–255. 256 isn't a multiple of 31, so plain `byte % 31`
 * would make the first few letters slightly more likely. We throw away bytes
 * of 248 or more (248 = 31 × 8), so every character is exactly equally likely.
 */
export function generateInviteCode(randomBytes: RandomBytes = cryptoRandomBytes): string {
  const size = INVITE_ALPHABET.length
  const limit = 256 - (256 % size)
  let code = ''
  while (code.length < INVITE_CODE_LENGTH) {
    for (const byte of randomBytes(16)) {
      if (byte < limit && code.length < INVITE_CODE_LENGTH) {
        code += INVITE_ALPHABET[byte % size]
      }
    }
  }
  return code
}

/** Forgive how people type codes: "k7mp-q2xr " → "K7MPQ2XR". */
export function normalizeInviteCode(input: string): string {
  return input.toUpperCase().replace(/[\s-]/g, '')
}

/** True when the code is the right length and uses only alphabet characters. */
export function isWellFormedInviteCode(code: string): boolean {
  return (
    code.length === INVITE_CODE_LENGTH && [...code].every((ch) => INVITE_ALPHABET.includes(ch))
  )
}

/** Display form, easier to read aloud: "K7MP-Q2XR". */
export function formatInviteCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`
}
