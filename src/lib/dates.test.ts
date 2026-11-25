import { describe, expect, it } from 'vitest'
import { formatDueDate, isValidDateOnly, parseDateOnly, todayDateOnly } from './dates'

describe('parseDateOnly / isValidDateOnly', () => {
  it('accepts real dates in YYYY-MM-DD', () => {
    expect(parseDateOnly('2026-12-07')).toEqual({ year: 2026, month: 12, day: 7 })
    expect(isValidDateOnly('2028-02-29')).toBe(true) // leap year
  })

  it.each([
    '2026-02-30', // no Feb 30
    '2027-02-29', // not a leap year
    '2026-13-01', // no month 13
    '2026-12-7', // needs two digits
    '12/07/2026',
    '2026-12-07T00:00',
    '',
    '1999-12-31', // before 2000
    '2100-01-01', // after 2099
  ])('rejects %j', (text) => {
    expect(isValidDateOnly(text)).toBe(false)
  })

  it('rejects non-text', () => {
    expect(isValidDateOnly(20261207)).toBe(false)
    expect(isValidDateOnly(null)).toBe(false)
  })
})

describe('formatDueDate', () => {
  it('shows the same calendar day whatever the timezone', () => {
    // Would print "Sun, Dec 6" in the Americas if we used new Date('2026-12-07').
    expect(formatDueDate('2026-12-07')).toMatch(/7/)
    expect(formatDueDate('2026-12-07')).not.toMatch(/\b6\b/)
  })

  it('leaves invalid text alone', () => {
    expect(formatDueDate('soon')).toBe('soon')
  })
})

describe('todayDateOnly', () => {
  it("uses the viewer's own calendar day", () => {
    // Local 23:30 on Dec 7 is already Dec 8 in UTC for anyone west of UTC.
    expect(todayDateOnly(new Date(2026, 11, 7, 23, 30))).toBe('2026-12-07')
  })
})
