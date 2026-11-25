/**
 * Date-only helpers. A due date is plain text "YYYY-MM-DD" with no time and no
 * timezone, and we keep it that way.
 *
 * Rule: never call `new Date("2026-12-07")`. JavaScript reads that as midnight
 * UTC, which is still Dec 6 in the Americas. Instead we split the text into
 * numbers and only do arithmetic with the UTC functions (`Date.UTC`,
 * `getUTCDate`, …), so the computer's timezone never takes part.
 */

export interface DateParts {
  year: number
  month: number // 1–12
  day: number // 1–31
}

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/

/** "2026-12-07" → { year: 2026, month: 12, day: 7 }, or null if not a real date. */
export function parseDateOnly(text: string): DateParts | null {
  const m = DATE_ONLY.exec(text)
  if (!m) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  // Round-trip through UTC: "2026-02-30" becomes March 2, so it won't match.
  const t = new Date(Date.UTC(year, month - 1, day))
  if (t.getUTCFullYear() !== year || t.getUTCMonth() !== month - 1 || t.getUTCDate() !== day) {
    return null
  }
  return { year, month, day }
}

/**
 * True when `value` is text in the exact form YYYY-MM-DD and is a real
 * calendar date between 2000 and 2099.
 */
export function isValidDateOnly(value: unknown): value is string {
  if (typeof value !== 'string') return false
  const parts = parseDateOnly(value)
  return parts !== null && parts.year >= 2000 && parts.year <= 2099
}

/** "2026-12-07" → "Mon, Dec 7" (in the viewer's language). Unchanged if invalid. */
export function formatDueDate(text: string): string {
  const p = parseDateOnly(text)
  if (!p) return text
  return new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString(undefined, {
    timeZone: 'UTC',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
}

/** A UTC-midnight Date → "YYYY-MM-DD" (reads only UTC parts). */
function toDateOnly(t: Date): string {
  const y = t.getUTCFullYear()
  const m = String(t.getUTCMonth() + 1).padStart(2, '0')
  const d = String(t.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** "2026-12-30" + 3 days → "2027-01-02". Null if the date isn't real. */
export function addDays(text: string, days: number): string | null {
  const p = parseDateOnly(text)
  if (!p) return null
  // Date.UTC rolls over months and years by itself (Dec 33 → Jan 2).
  return toDateOnly(new Date(Date.UTC(p.year, p.month - 1, p.day + days)))
}

/**
 * The Monday that starts this date's week. "2026-12-09" (Wed) → "2026-12-07".
 * Sunday belongs to the week that started six days earlier.
 * Null if the date isn't real.
 */
export function weekStart(text: string): string | null {
  const p = parseDateOnly(text)
  if (!p) return null
  // getUTCDay(): Sunday = 0, Monday = 1, … Saturday = 6.
  // (day + 6) % 7 turns that into "days since Monday": Mon = 0 … Sun = 6.
  const sinceMonday = (new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() + 6) % 7
  return addDays(text, -sinceMonday)
}

/** "2026-12-07" → "Dec 7–13"; across months "Dec 28 – Jan 3". */
export function formatWeekRange(monday: string): string {
  const start = parseDateOnly(monday)
  const sunday = addDays(monday, 6)
  const end = sunday ? parseDateOnly(sunday) : null
  if (!start || !end) return monday
  const fmt = (p: DateParts, opts: Intl.DateTimeFormatOptions) =>
    new Date(Date.UTC(p.year, p.month - 1, p.day)).toLocaleDateString(undefined, {
      timeZone: 'UTC',
      ...opts,
    })
  if (start.month === end.month) {
    return `${fmt(start, { month: 'short', day: 'numeric' })}–${end.day}`
  }
  return `${fmt(start, { month: 'short', day: 'numeric' })} – ${fmt(end, { month: 'short', day: 'numeric' })}`
}

/** Today on the viewer's own calendar, as "YYYY-MM-DD". */
export function todayDateOnly(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
