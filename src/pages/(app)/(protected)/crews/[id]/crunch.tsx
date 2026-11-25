/**
 * /crews/:id/crunch — hours per week for the next 8 weeks, stacked by the
 * member who posted each item, with heavy weeks highlighted.
 *
 * Nothing is stored: the totals are recalculated in the browser from the
 * crew's live items, so adding, editing or deleting an item anywhere in the
 * crew redraws this page without a reload.
 */

import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useQuery, useUserLookup } from 'deepspace'
import { CrewNotFound } from '@/components/crews/CrewNotFound'
import { useCrew } from '@/components/crews/useCrew'
import { assignSeries, WeekBars } from '@/components/crunch/WeekBars'
import { buildCrunchWeeks, CRUNCH_WEEKS, HEAVY_WEEK_HOURS_PER_MEMBER } from '@/lib/crunch'
import { todayDateOnly, weekStart } from '@/lib/dates'
import type { ItemInput } from '@/lib/item-validation'

type Item = ItemInput & { crewId: string }

interface Member {
  teamId: string
  userId: string
  status: 'active' | 'removed'
}

export default function CrunchPage() {
  const { id = '' } = useParams()
  const { crew, loading } = useCrew(id)
  if (loading) return <p className="p-6 text-sm text-muted-foreground">Loading crew…</p>
  if (!crew) return <CrewNotFound />
  return <CrunchView crewId={crew.crewId} crewName={crew.name} />
}

function CrunchView({ crewId, crewName }: { crewId: string; crewName: string }) {
  const { userId } = useAuth()
  const { getName } = useUserLookup()
  const items = useQuery<Item>('items', { where: { crewId } })
  const members = useQuery<Member>('team_members', { where: { teamId: crewId } })

  // Join order (oldest first) decides each member's color, so colors don't
  // shuffle when someone posts or deletes an item.
  const activeIds = [...members.records]
    .filter((m) => m.data.status === 'active')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((m) => m.data.userId)

  const thisWeek = weekStart(todayDateOnly()) ?? todayDateOnly()

  // Recalculate only when the items, the week, or the member count change.
  const summary = useMemo(
    () =>
      buildCrunchWeeks(
        items.records.map((r) => ({
          dueDate: r.data.dueDate,
          estHours: r.data.estHours,
          authorId: r.createdBy,
        })),
        thisWeek,
        CRUNCH_WEEKS,
        activeIds.length,
      ),
    [items.records, thisWeek, activeIds.length],
  )

  // Members first (join order), then any author who has since left.
  const authorIds = [...new Set(items.records.map((r) => r.createdBy))]
  const orderedIds = [...activeIds, ...authorIds.filter((a) => !activeIds.includes(a))]
  const { series, seriesKeyFor } = assignSeries(
    orderedIds.map((id) => ({
      id,
      label: id === userId ? 'You' : (getName(id) ?? 'A crewmate'),
    })),
  )

  const loadingData = items.status === 'loading' || members.status === 'loading'

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <Link to={`/crews/${crewId}`} className="text-sm text-muted-foreground hover:underline">
          ← {crewName}
        </Link>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Crunch week</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Estimated hours due each week, by who posted the item. A week is heavy at{' '}
          {HEAVY_WEEK_HOURS_PER_MEMBER} h per member ({activeIds.length}{' '}
          {activeIds.length === 1 ? 'member' : 'members'}).
        </p>
      </header>

      {loadingData ? (
        <p className="text-sm text-muted-foreground">Loading items…</p>
      ) : items.status === 'error' ? (
        <p className="text-sm text-destructive">Couldn't load items: {items.error}</p>
      ) : (
        <section className="rounded-lg border border-border bg-card p-4">
          <WeekBars summary={summary} series={series} seriesKeyFor={seriesKeyFor} thisWeek={thisWeek} />
          {(summary.earlier.count > 0 || summary.later.count > 0) && (
            <p className="mt-4 text-sm text-muted-foreground">
              {summary.earlier.count > 0 &&
                `Earlier (overdue): ${summary.earlier.hours} h in ${summary.earlier.count} ${
                  summary.earlier.count === 1 ? 'item' : 'items'
                }. `}
              {summary.later.count > 0 &&
                `Later: ${summary.later.hours} h in ${summary.later.count} ${
                  summary.later.count === 1 ? 'item' : 'items'
                }.`}
            </p>
          )}
        </section>
      )}
    </div>
  )
}
