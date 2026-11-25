/**
 * /crews/:id — one crew's items, with an Add item form and filters.
 *
 * The folder name `[id]` makes the router treat that part of the URL as a
 * value: /crews/abc123 opens this page with id = "abc123". The file is
 * `[id]/index.tsx` (not `[id].tsx`) so it can sit next to `[id]/crunch.tsx`;
 * a `[id].tsx` file would turn into a wrapper around the crunch page.
 *
 * Everything here is live. `useQuery('items', …)` only ever receives items
 * of crews you're in (server-enforced 'team' rule), and new or changed items
 * arrive without a reload.
 *
 * Who can do what (enforced on the server, not just hidden here):
 *  - add: any active member (addItem action)
 *  - edit: only the author (updateItem action)
 *  - delete: only the author (schema `delete: 'own'`)
 *  - Break it down: any active member, within their own daily AI cap
 *    (breakItDown action). Steps are stored on the item for everyone.
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useMutations, useQuery, useUserLookup } from 'deepspace'
import { Badge, Button, EmptyState, useToast } from '@/components/ui'
import { CrewNotFound } from '@/components/crews/CrewNotFound'
import { useCrew } from '@/components/crews/useCrew'
import { ItemForm } from '@/components/items/ItemForm'
import { callAction } from '@/lib/call-action'
import { formatDueDate } from '@/lib/dates'
import type { ItemInput, ItemType } from '@/lib/item-validation'
import { AI_DAILY_CAP, utcDay } from '@/lib/usage-limits'
import type { BreakDownResult } from '@/actions/break-down'

/** An item as stored: the five form fields plus the crew it belongs to. */
type Item = ItemInput & { crewId: string; steps?: string[] }

export default function CrewPage() {
  const { id = '' } = useParams()
  const { crew, loading } = useCrew(id)

  if (loading) {
    return <p className="p-6 text-sm text-muted-foreground">Loading crew…</p>
  }
  // Also what a non-member sees: the server never sends them the crew.
  if (!crew) return <CrewNotFound />

  return <CrewItems crewId={crew.crewId} crewName={crew.name} />
}

function CrewItems({ crewId, crewName }: { crewId: string; crewName: string }) {
  const { userId } = useAuth()
  const toast = useToast()
  const itemsQuery = useQuery<Item>('items', { where: { crewId } })
  const [typeFilter, setTypeFilter] = useState<'all' | ItemType>('all')
  const [courseFilter, setCourseFilter] = useState('all')

  // Your own AI usage today (the server only sends you your own row).
  const usage = useQuery<{ count: number }>('usage_counters', {
    where: { bucket: 'ai', day: utcDay(new Date()) },
  })
  const aiLeft = Math.max(0, AI_DAILY_CAP - Number(usage.records[0]?.data.count ?? 0))
  // Only one breakdown at a time on this page: every Break it down / Redo
  // button is disabled while one runs.
  const [aiBusyItemId, setAiBusyItemId] = useState<string | null>(null)

  async function breakDown(itemId: string, redo: boolean) {
    setAiBusyItemId(itemId)
    const r = await callAction<BreakDownResult>('breakItDown', { itemId, redo })
    setAiBusyItemId(null)
    if (!r.success) toast.error("Couldn't break it down", r.error)
    else if (!r.data.cached) toast.success('Steps ready', `${r.data.remaining} AI breakdowns left today`)
  }

  // Soonest due first; YYYY-MM-DD text sorts correctly as plain text.
  const allItems = [...itemsQuery.records].sort(
    (a, b) =>
      a.data.dueDate.localeCompare(b.data.dueDate) || a.data.title.localeCompare(b.data.title),
  )
  const courses = [...new Set(allItems.map((r) => r.data.course))].sort()
  const shown = allItems.filter(
    (r) =>
      (typeFilter === 'all' || r.data.type === typeFilter) &&
      (courseFilter === 'all' || r.data.course === courseFilter),
  )

  async function addItem(input: ItemInput): Promise<boolean> {
    const r = await callAction<{ itemId: string }>('addItem', { crewId, ...input })
    if (r.success) toast.success('Item added', input.title)
    else toast.error("Couldn't add item", r.error)
    return r.success
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
      <header>
        <Link to="/home" className="text-sm text-muted-foreground hover:underline">
          ← My crews
        </Link>
        <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{crewName}</h1>
          <Link
            to={`/crews/${crewId}/crunch`}
            className="text-sm font-medium underline-offset-4 hover:underline"
          >
            Crunch week →
          </Link>
        </div>
      </header>

      <section className="rounded-lg border border-border bg-card p-4" aria-labelledby="add-heading">
        <h2 id="add-heading" className="mb-3 font-medium">
          Add an assignment or exam
        </h2>
        <ItemForm idPrefix="add" submitLabel="Add item" courseSuggestions={courses} onSubmit={addItem} />
      </section>

      <section aria-labelledby="items-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="items-heading" className="font-medium">
            Items <span className="text-muted-foreground">({shown.length})</span>
          </h2>
          <p className="w-full text-xs text-muted-foreground sm:order-last" data-testid="ai-left">
            AI breakdowns left today: {aiLeft} of {AI_DAILY_CAP} (resets at midnight UTC)
          </p>
          <div className="flex gap-2">
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Type
              <select
                aria-label="Filter by type"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as 'all' | ItemType)}
              >
                <option value="all">All</option>
                <option value="assignment">Assignments</option>
                <option value="exam">Exams</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted-foreground">
              Course
              <select
                aria-label="Filter by course"
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
                value={courseFilter}
                onChange={(e) => setCourseFilter(e.target.value)}
              >
                <option value="all">All</option>
                {courses.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {itemsQuery.status === 'loading' ? (
          <p className="text-sm text-muted-foreground">Loading items…</p>
        ) : itemsQuery.status === 'error' ? (
          <p className="text-sm text-destructive">Couldn't load items: {itemsQuery.error}</p>
        ) : allItems.length === 0 ? (
          <EmptyState title="Nothing due yet" description="Add the crew's first assignment or exam above." />
        ) : shown.length === 0 ? (
          <p className="text-sm text-muted-foreground">No items match these filters.</p>
        ) : (
          <ul className="flex flex-col gap-2" data-testid="item-list">
            {shown.map((r) => (
              <ItemRow
                key={r.recordId}
                itemId={r.recordId}
                item={r.data}
                authorId={r.createdBy}
                isMine={r.createdBy === userId}
                courseSuggestions={courses}
                aiLeft={aiLeft}
                aiBusy={aiBusyItemId !== null}
                aiRunningHere={aiBusyItemId === r.recordId}
                onBreakDown={(redo) => breakDown(r.recordId, redo)}
              />
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

interface ItemRowProps {
  itemId: string
  item: Item
  authorId: string
  isMine: boolean
  courseSuggestions: string[]
  aiLeft: number
  /** A breakdown is running somewhere on the page. */
  aiBusy: boolean
  /** …and it's this item's. */
  aiRunningHere: boolean
  onBreakDown: (redo: boolean) => void
}

function ItemRow({
  itemId,
  item,
  authorId,
  isMine,
  courseSuggestions,
  aiLeft,
  aiBusy,
  aiRunningHere,
  onBreakDown,
}: ItemRowProps) {
  const toast = useToast()
  const { getName } = useUserLookup()
  const { removeConfirmed, ready } = useMutations<Item>('items')
  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  async function save(input: ItemInput): Promise<boolean> {
    const r = await callAction<{ itemId: string }>('updateItem', { itemId, ...input })
    if (r.success) {
      toast.success('Item updated')
      setEditing(false)
    } else {
      toast.error("Couldn't update item", r.error)
    }
    return r.success
  }

  async function remove() {
    setDeleting(true)
    try {
      // "Confirmed" waits for the server to accept the delete.
      await removeConfirmed(itemId)
      toast.success('Item deleted')
    } catch (e) {
      toast.error("Couldn't delete item", e instanceof Error ? e.message : undefined)
      setDeleting(false)
      setConfirmingDelete(false)
    }
  }

  if (editing) {
    return (
      <li className="rounded-lg border border-border bg-card p-4" data-testid="item-row">
        <ItemForm
          idPrefix={`edit-${itemId}`}
          initial={item}
          submitLabel="Save"
          courseSuggestions={courseSuggestions}
          onSubmit={save}
          onCancel={() => setEditing(false)}
        />
      </li>
    )
  }

  const hasSteps = Array.isArray(item.steps) && item.steps.length > 0
  const aiBlockedReason = aiLeft === 0 ? 'No AI breakdowns left today' : undefined

  return (
    <li className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4" data-testid="item-row">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{item.title}</p>
          <p className="text-sm text-muted-foreground">
            {item.course} · due {formatDueDate(item.dueDate)} · {item.estHours} h · by{' '}
            {isMine ? 'you' : (getName(authorId) ?? 'a crewmate')}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={item.type === 'exam' ? 'warning' : 'secondary'}>
            {item.type === 'exam' ? 'Exam' : 'Assignment'}
          </Badge>
          {isMine &&
            (confirmingDelete ? (
              <>
                <Button
                  size="sm"
                  variant="destructive"
                  onClick={remove}
                  disabled={!ready || deleting}
                  loading={deleting}
                >
                  Confirm delete
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  Keep
                </Button>
              </>
            ) : (
              <>
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  Edit
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirmingDelete(true)} disabled={!ready}>
                  Delete
                </Button>
              </>
            ))}
        </div>
      </div>

      {/* Break it down: show saved steps, or offer to make them. */}
      {hasSteps ? (
        <div className="flex flex-col gap-2 border-t border-border pt-3" data-testid="item-steps">
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {item.steps!.map((step, i) => (
              <li key={i}>{step}</li>
            ))}
          </ol>
          <div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onBreakDown(true)}
              disabled={aiBusy || aiLeft === 0}
              loading={aiRunningHere}
              title={aiBlockedReason ?? 'Ask the AI for new steps (uses one of your daily breakdowns)'}
            >
              {aiRunningHere ? 'Redoing…' : 'Redo steps'}
            </Button>
          </div>
        </div>
      ) : (
        <div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => onBreakDown(false)}
            disabled={aiBusy || aiLeft === 0}
            loading={aiRunningHere}
            title={aiBlockedReason ?? 'Use AI to turn this into 4–6 study steps'}
          >
            {aiRunningHere ? 'Breaking it down…' : 'Break it down'}
          </Button>
        </div>
      )}
    </li>
  )
}
