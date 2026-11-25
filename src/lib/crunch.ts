/**
 * Crunch-week totals: how many estimated hours fall in each week, split by
 * the member who posted each item.
 *
 * A plain function (no React, no server), so it's easy to test.
 * Weeks start on Monday. All date math is date-only (see dates.ts): no
 * timezone ever takes part, so a Sunday deadline can't slide into the wrong
 * week on someone's laptop.
 */

import { addDays, weekStart } from './dates'

/**
 * A week is "heavy" when the crew's hours that week, divided by the number of
 * active members, reach this many hours.
 *
 * Why 15: the usual rule of thumb is 2–3 hours of outside study per credit
 * hour per week, so a 15-credit load already takes ~30–45 hours outside
 * class. Deadline work of 15 hours on top of that (about 2 extra hours a
 * day) leaves almost no slack. A judgment call — change it here.
 */
export const HEAVY_WEEK_HOURS_PER_MEMBER = 15

/** How many weeks the crunch view shows, starting with the current week. */
export const CRUNCH_WEEKS = 8

/** What the function needs from each item. */
export interface CrunchItem {
  dueDate: string
  estHours: number
  authorId: string
}

export interface WeekTotal {
  /** The Monday that starts this week, "YYYY-MM-DD". */
  weekStart: string
  total: number
  /** Hours per author id. Authors with 0 hours that week are left out. */
  byMember: Record<string, number>
  heavy: boolean
}

export interface CrunchSummary {
  weeks: WeekTotal[]
  /** Hours at which a week counts as heavy for this crew. */
  heavyLine: number
  /** Due before the first week shown (overdue, if the first week is this week). */
  earlier: { hours: number; count: number }
  /** Due after the last week shown. */
  later: { hours: number; count: number }
  /** Items with an unreadable date or hours (shouldn't happen; validation blocks them). */
  skipped: number
}

/**
 * @param items       the crew's items
 * @param firstWeek   any date in the first week to show (usually today)
 * @param weekCount   how many weeks to show (empty weeks are included)
 * @param memberCount active members in the crew, for the heavy line
 */
export function buildCrunchWeeks(
  items: readonly CrunchItem[],
  firstWeek: string,
  weekCount: number,
  memberCount: number,
): CrunchSummary {
  const heavyLine = HEAVY_WEEK_HOURS_PER_MEMBER * Math.max(memberCount, 1)
  const first = weekStart(firstWeek)
  const summary: CrunchSummary = {
    weeks: [],
    heavyLine,
    earlier: { hours: 0, count: 0 },
    later: { hours: 0, count: 0 },
    skipped: 0,
  }
  if (!first) {
    summary.skipped = items.length
    return summary
  }

  // One empty bucket per week, and a lookup from Monday → bucket.
  const byStart = new Map<string, WeekTotal>()
  for (let i = 0; i < weekCount; i++) {
    const start = addDays(first, 7 * i)!
    const week: WeekTotal = { weekStart: start, total: 0, byMember: {}, heavy: false }
    summary.weeks.push(week)
    byStart.set(start, week)
  }
  const lastStart = summary.weeks.at(-1)?.weekStart ?? first

  for (const item of items) {
    const start = weekStart(item.dueDate)
    const hours = item.estHours
    if (!start || typeof hours !== 'number' || !Number.isFinite(hours) || hours <= 0) {
      summary.skipped++
      continue
    }
    // "YYYY-MM-DD" text sorts the same way as the dates themselves.
    if (start < first) {
      summary.earlier.hours += hours
      summary.earlier.count++
    } else if (start > lastStart) {
      summary.later.hours += hours
      summary.later.count++
    } else {
      const week = byStart.get(start)!
      week.total += hours
      week.byMember[item.authorId] = (week.byMember[item.authorId] ?? 0) + hours
    }
  }

  for (const week of summary.weeks) {
    week.heavy = week.total > 0 && week.total >= heavyLine
  }
  return summary
}
