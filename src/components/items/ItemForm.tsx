/**
 * The add/edit form for an item. Used twice on the crew page: once empty
 * (Add item), and once per item being edited (pre-filled).
 *
 * It checks the fields with the same validateItemInput the server uses, so
 * people see problems before anything is sent. The server checks again.
 */

import { useState, type FormEvent } from 'react'
import { Button, Input, Label } from '@/components/ui'
import { todayDateOnly } from '@/lib/dates'
import { EST_HOURS_MAX, validateItemInput, type ItemInput } from '@/lib/item-validation'
import { ITEM_COURSE_MAX, ITEM_TITLE_MAX } from '@/schemas/items-schema'

interface ItemFormProps {
  /** Start values (edit mode). Leave out for an empty Add form. */
  initial?: ItemInput
  submitLabel: string
  /** Existing course names, offered as suggestions while typing. */
  courseSuggestions: string[]
  /** Sends the item; resolves true when the server accepted it. */
  onSubmit: (input: ItemInput) => Promise<boolean>
  onCancel?: () => void
  /** Makes ids unique when several forms are on the page. */
  idPrefix: string
}

const selectClass =
  'flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm'

export function ItemForm({
  initial,
  submitLabel,
  courseSuggestions,
  onSubmit,
  onCancel,
  idPrefix,
}: ItemFormProps) {
  const [title, setTitle] = useState(initial?.title ?? '')
  const [course, setCourse] = useState(initial?.course ?? '')
  const [dueDate, setDueDate] = useState(initial?.dueDate ?? todayDateOnly())
  const [type, setType] = useState<string>(initial?.type ?? 'assignment')
  // Kept as text while typing ("2.", "") and turned into a number on submit.
  const [hours, setHours] = useState(initial ? String(initial.estHours) : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    const v = validateItemInput({
      title,
      course,
      dueDate,
      type,
      estHours: hours.trim() === '' ? Number.NaN : Number(hours),
    })
    if (!v.ok) {
      setError(v.error)
      return
    }
    setError(null)
    setBusy(true)
    const accepted = await onSubmit(v.value)
    setBusy(false)
    if (accepted && !initial) {
      // Fresh Add form for the next item; keep course and type, which repeat.
      setTitle('')
      setHours('')
    }
  }

  const id = (name: string) => `${idPrefix}-${name}`

  return (
    <form onSubmit={handleSubmit} className="grid gap-3 sm:grid-cols-6" noValidate>
      <div className="flex flex-col gap-1.5 sm:col-span-6">
        <Label htmlFor={id('title')}>Title</Label>
        <Input
          id={id('title')}
          placeholder="e.g. Lab report 4"
          value={title}
          maxLength={ITEM_TITLE_MAX}
          onChange={(e) => setTitle(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id('course')}>Course</Label>
        <Input
          id={id('course')}
          placeholder="e.g. CHEM 101"
          list={id('courses')}
          value={course}
          maxLength={ITEM_COURSE_MAX}
          onChange={(e) => setCourse(e.target.value)}
          disabled={busy}
        />
        <datalist id={id('courses')}>
          {courseSuggestions.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-2">
        <Label htmlFor={id('due')}>Due date</Label>
        {/* type="date" always hands us "YYYY-MM-DD", whatever the display format. */}
        <Input
          id={id('due')}
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          disabled={busy}
        />
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor={id('type')}>Type</Label>
        <select
          id={id('type')}
          className={selectClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
          disabled={busy}
        >
          <option value="assignment">Assignment</option>
          <option value="exam">Exam</option>
        </select>
      </div>

      <div className="flex flex-col gap-1.5 sm:col-span-1">
        <Label htmlFor={id('hours')}>Est. hours</Label>
        <Input
          id={id('hours')}
          type="number"
          inputMode="decimal"
          min={0.25}
          max={EST_HOURS_MAX}
          step={0.25}
          placeholder="3"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          disabled={busy}
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive sm:col-span-6">
          {error}
        </p>
      )}

      <div className="flex gap-2 sm:col-span-6">
        <Button type="submit" disabled={busy} loading={busy}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  )
}
