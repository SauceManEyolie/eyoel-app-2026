/**
 * /crews/:id — one crew's items, with an Add item form and filters.
 *
 * The file name `[id].tsx` makes the router treat that part of the URL as a
 * value: /crews/abc123 opens this page with id = "abc123".
 *
 * Everything here is live. `useQuery('items', …)` only ever receives items
 * of crews you're in (server-enforced 'team' rule), and new or changed items
 * arrive without a reload.
 *
 * Who can do what (enforced on the server, not just hidden here):
 *  - add: any active member (addItem action)
 *  - edit: only the author (updateItem action)
 *  - delete: only the author (schema `delete: 'own'`)
 */

import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth, useMutations, useQuery, useUserLookup } from 'deepspace'
import { Badge, Button, EmptyState, useToast } from '@/components/ui'
import { ItemForm } from '@/components/items/ItemForm'
import { callAction } from '@/lib/call-action'
import { formatDueDate } from '@/lib/dates'
import type { ItemInput, ItemType } from '@/lib/item-validation'

interface Crew {
  crewId: string
  name: string
  inviteCode: string
}

/** An item as stored: the five form fields plus the crew it belongs to. */
type Item = ItemInput & { crewId: string; steps?: string[] }

export default function CrewPage() {
  const { id = '' } = useParams()
  const crewQuery = useQuery<Crew>('crews', { where: { crewId: id } })
  const crew = crewQuery.records[0]?.data

  if (crewQuery.status === 'loading') {
    return <p className="p-6 text-sm text-muted-foreground">Loading crew…</p>
  }
  if (!crew) {
    // Also what a non-member sees: the server never sends them the crew.
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <EmptyState
          title="Crew not found"
          description="It doesn't exist, or you're not a member. Ask a crewmate for the invite code."
        />
        <Link to="/home" className="mt-4 inline-block text-sm underline underline-offset-4">
          Back to My crews
        </Link>
      </div>
    )
  }

  return <CrewItems crewId={crew.crewId} crewName={crew.name} />
}

function CrewItems({ crewId, crewName }: { crewId: string; crewName: string }) {
  const { userId } = useAuth()
  const toast = useToast()
  const itemsQuery = useQuery<Item>('items', { where: { crewId } })
  const [typeFilter, setTypeFilter] = useState<'all' | ItemType>('all')
  const [courseFilter, setCourseFilter] = useState('all')

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
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{crewName}</h1>
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
}

function ItemRow({ itemId, item, authorId, isMine, courseSuggestions }: ItemRowProps) {
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

  return (
    <li
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4"
      data-testid="item-row"
    >
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
    </li>
  )
}
