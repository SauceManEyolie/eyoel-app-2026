import { afterEach, describe, expect, it } from 'vitest'
import { addDays, formatWeekRange, weekStart } from './dates'
import { buildCrunchWeeks, HEAVY_WEEK_HOURS_PER_MEMBER, type CrunchItem } from './crunch'

describe('weekStart (Monday start, date-only)', () => {
  it.each([
    ['a Sunday belongs to the week before', '2026-12-06', '2026-11-30'],
    ['a Monday is its own week start', '2026-12-07', '2026-12-07'],
    ['mid-week', '2026-12-09', '2026-12-07'],
    ['year boundary: Fri Jan 1, 2027', '2027-01-01', '2026-12-28'],
    ['year boundary: Thu Dec 31, 2026', '2026-12-31', '2026-12-28'],
    ['US clocks forward (Sun Mar 8, 2026)', '2026-03-08', '2026-03-02'],
    ['the Monday after US clocks forward', '2026-03-09', '2026-03-09'],
    ['US clocks back (Sun Nov 1, 2026)', '2026-11-01', '2026-10-26'],
    ['EU clocks forward (Sun Mar 29, 2026)', '2026-03-29', '2026-03-23'],
    ['leap day', '2028-02-29', '2028-02-28'],
  ])('%s: %s → %s', (_label, date, monday) => {
    expect(weekStart(date)).toBe(monday)
  })

  it('returns null for a date that is not real', () => {
    expect(weekStart('2026-02-30')).toBeNull()
  })
})

describe('addDays / formatWeekRange', () => {
  it('rolls over months and years', () => {
    expect(addDays('2026-12-28', 7)).toBe('2027-01-04')
    expect(addDays('2026-03-02', 7)).toBe('2026-03-09') // across US clock change
  })

  it('labels a week inside one month and across two', () => {
    expect(formatWeekRange('2026-12-07')).toMatch(/7.*13/)
    expect(formatWeekRange('2026-12-28')).toMatch(/28.*3/)
  })
})

describe('the same answers in any timezone', () => {
  const original = process.env.TZ
  afterEach(() => {
    process.env.TZ = original
  })

  it.each(['America/New_York', 'Pacific/Auckland', 'Europe/London'])('in %s', (tz) => {
    process.env.TZ = tz
    // Guard: prove the switch really happened, or this test would prove nothing.
    // Offsets in minutes on Jan 1 2026: New York +300, Auckland -780, London 0.
    const expected = { 'America/New_York': 300, 'Pacific/Auckland': -780, 'Europe/London': 0 }[tz]
    expect(new Date(2026, 0, 1).getTimezoneOffset()).toBe(expected)

    expect(weekStart('2026-12-06')).toBe('2026-11-30')
    expect(weekStart('2027-01-01')).toBe('2026-12-28')
    expect(weekStart('2026-03-08')).toBe('2026-03-02')
    expect(weekStart('2026-11-01')).toBe('2026-10-26')
    const s = buildCrunchWeeks([{ dueDate: '2026-12-06', estHours: 2, authorId: 'a' }], '2026-11-30', 2, 1)
    expect(s.weeks[0].total).toBe(2)
  })
})

describe('buildCrunchWeeks', () => {
  const A = 'user_alice'
  const B = 'user_bob'
  const item = (dueDate: string, estHours: number, authorId = A): CrunchItem => ({
    dueDate,
    estHours,
    authorId,
  })

  it('makes one bucket per week, empty weeks included, starting on Monday', () => {
    const s = buildCrunchWeeks([], '2026-12-09', 3, 2)
    expect(s.weeks.map((w) => w.weekStart)).toEqual(['2026-12-07', '2026-12-14', '2026-12-21'])
    expect(s.weeks.every((w) => w.total === 0 && !w.heavy)).toBe(true)
  })

  it('totals hours per week and per member', () => {
    const s = buildCrunchWeeks(
      [
        item('2026-12-07', 3, A), // Mon
        item('2026-12-13', 2, B), // Sun, same week
        item('2026-12-09', 1.5, A),
        item('2026-12-14', 4, B), // next Monday
      ],
      '2026-12-07',
      2,
      2,
    )
    expect(s.weeks[0]).toMatchObject({ total: 6.5, byMember: { [A]: 4.5, [B]: 2 } })
    expect(s.weeks[1]).toMatchObject({ total: 4, byMember: { [B]: 4 } })
  })

  it('counts items before and after the window separately', () => {
    const s = buildCrunchWeeks(
      [item('2026-12-01', 2), item('2026-11-02', 1), item('2027-03-01', 5)],
      '2026-12-07',
      2,
      1,
    )
    expect(s.earlier).toEqual({ hours: 3, count: 2 })
    expect(s.later).toEqual({ hours: 5, count: 1 })
    expect(s.weeks.every((w) => w.total === 0)).toBe(true)
  })

  it('adds quarter hours exactly', () => {
    const s = buildCrunchWeeks([item('2026-12-07', 0.25), item('2026-12-08', 0.75)], '2026-12-07', 1, 1)
    expect(s.weeks[0].total).toBe(1)
  })

  it('skips unreadable items without crashing', () => {
    const s = buildCrunchWeeks(
      [item('2026-02-30', 2), item('2026-12-07', Number.NaN), item('2026-12-07', 2)],
      '2026-12-07',
      1,
      1,
    )
    expect(s.skipped).toBe(2)
    expect(s.weeks[0].total).toBe(2)
  })

  it(`marks a week heavy at ${HEAVY_WEEK_HOURS_PER_MEMBER} h per member, not below`, () => {
    // 3 members → heavy line at 45 h.
    const almost = buildCrunchWeeks([item('2026-12-07', 44.75)], '2026-12-07', 1, 3)
    expect(almost.heavyLine).toBe(45)
    expect(almost.weeks[0].heavy).toBe(false)
    const heavy = buildCrunchWeeks([item('2026-12-07', 44.75), item('2026-12-08', 0.25)], '2026-12-07', 1, 3)
    expect(heavy.weeks[0].heavy).toBe(true)
  })

  it('does not divide by zero with no members', () => {
    const s = buildCrunchWeeks([item('2026-12-07', 20)], '2026-12-07', 1, 0)
    expect(s.heavyLine).toBe(HEAVY_WEEK_HOURS_PER_MEMBER)
    expect(s.weeks[0].heavy).toBe(true)
  })

  it('keeps the input list unchanged', () => {
    const input = [item('2026-12-07', 2)]
    const copy = structuredClone(input)
    buildCrunchWeeks(input, '2026-12-07', 1, 1)
    expect(input).toEqual(copy)
  })
})
