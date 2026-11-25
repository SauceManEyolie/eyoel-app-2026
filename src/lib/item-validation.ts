/**
 * Item field rules, used in two places:
 *  - the server actions addItem/updateItem (the real gate), and
 *  - the add/edit form, so people see the same message before sending.
 */

import { isValidDateOnly } from './dates'
import { ITEM_COURSE_MAX, ITEM_TITLE_MAX } from '../schemas/items-schema'

export type ItemType = 'assignment' | 'exam'

/** The five fields a person fills in. */
export interface ItemInput {
  title: string
  course: string
  dueDate: string
  type: ItemType
  estHours: number
}

export const EST_HOURS_MAX = 100

/** Either the cleaned-up value, or a message saying what's wrong. */
export type Validation<T> = { ok: true; value: T } | { ok: false; error: string }

export function validateItemInput(raw: unknown): Validation<ItemInput> {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  const title = typeof r.title === 'string' ? r.title.trim() : ''
  if (!title) return { ok: false, error: 'Add a title.' }
  if (title.length > ITEM_TITLE_MAX) {
    return { ok: false, error: `Titles can be at most ${ITEM_TITLE_MAX} characters.` }
  }

  const course = typeof r.course === 'string' ? r.course.trim() : ''
  if (!course) return { ok: false, error: 'Add a course.' }
  if (course.length > ITEM_COURSE_MAX) {
    return { ok: false, error: `Course names can be at most ${ITEM_COURSE_MAX} characters.` }
  }

  if (!isValidDateOnly(r.dueDate)) {
    return { ok: false, error: 'Due date must be a real date written YYYY-MM-DD (2000–2099).' }
  }
  const dueDate = r.dueDate

  if (r.type !== 'assignment' && r.type !== 'exam') {
    return { ok: false, error: 'Type must be assignment or exam.' }
  }
  const type = r.type

  const estHours = r.estHours
  if (
    typeof estHours !== 'number' ||
    !Number.isFinite(estHours) ||
    estHours <= 0 ||
    estHours > EST_HOURS_MAX ||
    !Number.isInteger(estHours * 4)
  ) {
    return {
      ok: false,
      error: `Estimated hours must be more than 0 and at most ${EST_HOURS_MAX}, in quarter-hour steps.`,
    }
  }

  return { ok: true, value: { title, course, dueDate, type, estHours } }
}
