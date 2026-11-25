/**
 * Horizontal stacked bars: one row per week, one colored segment per member.
 *
 * Drawn with plain HTML/CSS (no chart library). Design rules followed (from
 * the dataviz guide): fixed color order by member, 2px gaps between
 * segments, a rounded far end and a square baseline end, a legend, text in
 * text colors (never the series color), a hover tooltip on each segment, and
 * a table view, which the light theme needs because three colors are under
 * 3:1 contrast there.
 */

import { AlertTriangle } from 'lucide-react'
import { formatWeekRange } from '@/lib/dates'
import type { CrunchSummary } from '@/lib/crunch'

export interface Series {
  /** Member id, or 'other' for the folded group. */
  key: string
  label: string
  /** CSS color, e.g. 'var(--series-1)'. */
  color: string
}

const MAX_SLOTS = 8

/**
 * Give each member a fixed color slot in the order given (join order), so a
 * member keeps their color as data changes. Past 8 members, the 8th slot
 * becomes "Others" and everyone from there on is folded into it.
 */
export function assignSeries(members: { id: string; label: string }[]): {
  series: Series[]
  seriesKeyFor: (memberId: string) => string
} {
  const fold = members.length > MAX_SLOTS
  const named = fold ? members.slice(0, MAX_SLOTS - 1) : members
  const series: Series[] = named.map((m, i) => ({
    key: m.id,
    label: m.label,
    color: `var(--series-${i + 1})`,
  }))
  if (fold) series.push({ key: 'other', label: 'Others', color: 'var(--series-other)' })
  const namedIds = new Set(named.map((m) => m.id))
  return { series, seriesKeyFor: (id) => (namedIds.has(id) ? id : 'other') }
}

function hoursText(h: number): string {
  return `${Number.isInteger(h) ? h : h.toFixed(2).replace(/0$/, '')} h`
}

interface WeekBarsProps {
  summary: CrunchSummary
  series: Series[]
  seriesKeyFor: (memberId: string) => string
  /** The Monday of the current week, to label "This week". */
  thisWeek: string
}

export function WeekBars({ summary, series, seriesKeyFor, thisWeek }: WeekBarsProps) {
  // Fold each week's per-member hours into per-series hours.
  const rows = summary.weeks.map((w) => {
    const bySeries: Record<string, number> = {}
    for (const [memberId, h] of Object.entries(w.byMember)) {
      const key = seriesKeyFor(memberId)
      bySeries[key] = (bySeries[key] ?? 0) + h
    }
    return { ...w, bySeries }
  })
  const maxTotal = Math.max(0, ...rows.map((r) => r.total))
  // The scale always includes the heavy line, so the marker is on screen.
  const scale = Math.max(maxTotal, summary.heavyLine)
  const heavyAt = (summary.heavyLine / scale) * 100
  const windowTotals: Record<string, number> = {}
  for (const r of rows) {
    for (const [k, h] of Object.entries(r.bySeries)) windowTotals[k] = (windowTotals[k] ?? 0) + h
  }

  return (
    <div className="viz-root flex flex-col gap-4">
      {/* Legend: always shown for 2+ series; names in text color, color in the swatch. */}
      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm" aria-label="Members">
        {series.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5">
            <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: s.color }} />
            <span>{s.label}</span>
            <span className="text-muted-foreground">{hoursText(windowTotals[s.key] ?? 0)}</span>
          </li>
        ))}
        <li className="flex items-center gap-1.5 text-muted-foreground">
          <span aria-hidden className="inline-block h-3 border-l-2 border-dashed border-muted-foreground" />
          Heavy at {hoursText(summary.heavyLine)}
        </li>
      </ul>

      <ol className="flex flex-col gap-2" data-testid="crunch-weeks">
        {rows.map((r) => {
          const isThisWeek = r.weekStart === thisWeek
          const label = formatWeekRange(r.weekStart)
          const parts = series
            .filter((s) => (r.bySeries[s.key] ?? 0) > 0)
            .map((s) => ({ ...s, hours: r.bySeries[s.key] }))
          const description =
            `${label}: ${hoursText(r.total)} total` +
            (parts.length ? `; ${parts.map((p) => `${p.label} ${hoursText(p.hours)}`).join(', ')}` : '') +
            (r.heavy ? '; heavy week' : '')

          return (
            <li
              key={r.weekStart}
              data-testid="week-row"
              data-week-start={r.weekStart}
              aria-label={description}
              className={`grid grid-cols-[6.5rem_1fr_3.5rem] items-center gap-3 rounded-md px-2 py-1.5 ${
                r.heavy ? 'bg-warning/10' : ''
              }`}
            >
              <div className="flex flex-col text-sm leading-tight">
                <span className="font-medium">{label}</span>
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  {isThisWeek && 'This week'}
                  {r.heavy && (
                    <span className="flex items-center gap-0.5 font-medium text-warning">
                      <AlertTriangle aria-hidden className="h-3 w-3" /> Heavy
                    </span>
                  )}
                </span>
              </div>

              {/* Track: the bar grows from the left (square end) to its total. */}
              <div className="relative h-5">
                <div
                  className="flex h-full gap-[2px]"
                  style={{ width: `${(r.total / scale) * 100}%` }}
                >
                  {parts.map((p, i) => (
                    <div
                      key={p.key}
                      title={`${p.label}: ${hoursText(p.hours)}`}
                      className={i === parts.length - 1 ? 'rounded-r-[4px]' : ''}
                      style={{ background: p.color, flexGrow: p.hours, flexBasis: 0 }}
                    />
                  ))}
                </div>
                {r.total === 0 && <div className="absolute inset-y-1/2 left-0 right-0 h-px bg-border" />}
                <div
                  aria-hidden
                  className="absolute -inset-y-0.5 border-l-2 border-dashed border-muted-foreground/60"
                  style={{ left: `${heavyAt}%` }}
                />
              </div>

              <span className="text-right text-sm tabular-nums" data-testid="week-total">
                {hoursText(r.total)}
              </span>
            </li>
          )
        })}
      </ol>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Show as table</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="py-1 pr-3 font-normal">Week</th>
                {series.map((s) => (
                  <th key={s.key} className="py-1 pr-3 font-normal">
                    {s.label}
                  </th>
                ))}
                <th className="py-1 pr-3 font-normal">Total</th>
                <th className="py-1 font-normal">Heavy?</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.weekStart} className="border-b border-border/50">
                  <td className="py-1 pr-3">{formatWeekRange(r.weekStart)}</td>
                  {series.map((s) => (
                    <td key={s.key} className="py-1 pr-3 tabular-nums">
                      {hoursText(r.bySeries[s.key] ?? 0)}
                    </td>
                  ))}
                  <td className="py-1 pr-3 tabular-nums">{hoursText(r.total)}</td>
                  <td className="py-1">{r.heavy ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}
