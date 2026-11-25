import { describe, expect, it } from 'vitest'
import { assignSeries } from './WeekBars'

const people = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `u${i + 1}`, label: `P${i + 1}` }))

describe('assignSeries', () => {
  it('gives colors in fixed order by position', () => {
    const { series } = assignSeries(people(3))
    expect(series.map((s) => s.color)).toEqual(['var(--series-1)', 'var(--series-2)', 'var(--series-3)'])
  })

  it('uses all 8 slots for exactly 8 members, no "Others"', () => {
    const { series } = assignSeries(people(8))
    expect(series).toHaveLength(8)
    expect(series.some((s) => s.key === 'other')).toBe(false)
  })

  it('folds members 8+ into "Others" when there are more than 8', () => {
    const { series, seriesKeyFor } = assignSeries(people(10))
    expect(series).toHaveLength(8)
    expect(series[7]).toMatchObject({ key: 'other', label: 'Others', color: 'var(--series-other)' })
    expect(seriesKeyFor('u7')).toBe('u7')
    expect(seriesKeyFor('u8')).toBe('other')
    expect(seriesKeyFor('u10')).toBe('other')
  })

  it("keeps a member's color when someone later in the list leaves", () => {
    const before = assignSeries(people(3)).series.find((s) => s.key === 'u2')!.color
    const after = assignSeries(people(2)).series.find((s) => s.key === 'u2')!.color
    expect(after).toBe(before)
  })
})
