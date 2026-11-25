import { describe, expect, it } from 'vitest'
import {
  formatInviteCode,
  generateInviteCode,
  INVITE_ALPHABET,
  isWellFormedInviteCode,
  normalizeInviteCode,
} from './invite-code'

describe('INVITE_ALPHABET', () => {
  it('has 31 unique characters with no look-alikes', () => {
    expect(INVITE_ALPHABET).toHaveLength(31)
    expect(new Set(INVITE_ALPHABET).size).toBe(31)
    for (const ch of '01OIL') expect(INVITE_ALPHABET).not.toContain(ch)
  })
})

describe('generateInviteCode', () => {
  it('makes 8 characters from the alphabet', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateInviteCode()
      expect(code).toHaveLength(8)
      expect(isWellFormedInviteCode(code)).toBe(true)
    }
  })

  it('rarely repeats', () => {
    const codes = new Set(Array.from({ length: 1000 }, () => generateInviteCode()))
    expect(codes.size).toBe(1000)
  })

  it('throws away biased bytes (248–255) instead of using them', () => {
    // First batch: all 255s (rejected), then a batch that maps to "2345…".
    let call = 0
    const fake = (n: number) => {
      call++
      return call === 1
        ? new Uint8Array(n).fill(255)
        : Uint8Array.from({ length: n }, (_, i) => i % 31)
    }
    expect(generateInviteCode(fake)).toBe('23456789')
    expect(call).toBe(2)
  })

  it('maps byte 247 (the highest kept) to the last character', () => {
    const fake = (n: number) => new Uint8Array(n).fill(247) // 247 % 31 = 30
    expect(generateInviteCode(fake)).toBe('ZZZZZZZZ')
  })
})

describe('normalizeInviteCode / formatInviteCode', () => {
  it('uppercases and strips spaces and dashes', () => {
    expect(normalizeInviteCode(' k7mp-q2xr ')).toBe('K7MPQ2XR')
  })

  it('round-trips the display form', () => {
    expect(formatInviteCode('K7MPQ2XR')).toBe('K7MP-Q2XR')
    expect(normalizeInviteCode(formatInviteCode('K7MPQ2XR'))).toBe('K7MPQ2XR')
  })

  it('rejects wrong length or characters', () => {
    expect(isWellFormedInviteCode('K7MPQ2X')).toBe(false)
    expect(isWellFormedInviteCode('K7MPQ2X0')).toBe(false) // 0 isn't in the alphabet
    expect(isWellFormedInviteCode('k7mpq2xr')).toBe(false) // must be normalized first
  })
})
